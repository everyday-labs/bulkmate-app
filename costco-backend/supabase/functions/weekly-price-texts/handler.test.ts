import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { FakeTime } from 'jsr:@std/testing@1/time';
import { handler } from './handler.ts';
import {
  type Call,
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
} from '../_testing/fakeSupabase.ts';

const SMS = 'POST https://api.brevo.com/v3/transactionalSMS/send';
const jwt = (claims: object) => `h.${btoa(JSON.stringify(claims))}.sig`;
const SERVICE = jwt({ role: 'service_role' });

function setup(routes: Record<string, unknown> = {}) {
  const cleanup = setFunctionEnv({ BREVO_API_KEY: 'brevo-key' });
  const api = fakeSupabase({
    'GET profiles': [
      { id: 'u1', phone_number: '+15550000001' },
      { id: 'u2', phone_number: '+15550000002' },
      { id: 'u3', phone_number: '+15550000003' },
    ],
    'GET price_alerts': (c: Call) =>
      ({
        'eq.u1': [
          { id: 'a1', delta: '3.00' },
          { id: 'a2', delta: '1.50' },
        ],
        'eq.u2': [],
        'eq.u3': errorResponse(500, { message: 'timeout' }),
      })[c.params.get('user_id')!],
    'PATCH price_alerts': null,
    [SMS]: { messageId: 1 },
    ...routes,
  });
  return { api, done: () => (api.restore(), cleanup()) };
}

Deno.test('weekly-price-texts: only the service role may call it', async () => {
  for (const token of [undefined, jwt({ role: 'authenticated' }), 'not-a-jwt', 'a.!!!.b']) {
    const res = await handler(request({ force: true }, { token }));
    assertEquals(res.status, 403);
    await res.body?.cancel();
  }
});

Deno.test('weekly-price-texts: skips outside Friday 3 PM Pacific unless forced', async () => {
  // Thursday 3 PM PDT. No network is touched on the skip path.
  const time = new FakeTime(new Date('2026-10-08T22:00:00Z'));
  try {
    const res = await handler(request({}, { token: SERVICE }));
    assertEquals(await res.json(), {
      skipped: true,
      reason: 'LA time is Thu 15:00, not Fri 15:00',
    });
  } finally {
    time.restore();
  }
});

Deno.test('weekly-price-texts: texts each user with drops once and marks the alerts', async () => {
  const { api, done } = setup();
  try {
    const res = await quiet(() => handler(request({ force: true }, { token: SERVICE })));
    assertEquals(await res.json(), { opted_in: 3, users_with_drops: 1, texts_sent: 1 });

    const [sms] = api.calls(SMS);
    const body = sms.body as { recipient: string; content: string };
    assertEquals(body.recipient, '15550000001');
    assertStringIncludes(body.content, '2 price drops');
    assertStringIncludes(body.content, '$4.50');

    const [mark] = api.calls('PATCH price_alerts');
    assertEquals(mark.params.get('id'), 'in.(a1,a2)');
    // Only unsent, undismissed alerts from the last 30 days are included.
    const q = api.calls('GET price_alerts')[0].params;
    assertEquals(q.get('texted_at'), 'is.null');
    assertEquals(q.get('dismissed_at'), 'is.null');
  } finally {
    done();
  }
});

Deno.test('weekly-price-texts: a failed text leaves the alerts for next week', async () => {
  const { api, done } = setup({ [SMS]: errorResponse(400, { message: 'no credits' }) });
  try {
    const res = await quiet(() => handler(request({ force: true }, { token: SERVICE })));
    assertEquals((await res.json()).texts_sent, 0);
    assertEquals(api.calls('PATCH price_alerts').length, 0);
  } finally {
    done();
  }
});

Deno.test('weekly-price-texts: a failed recipients query is a server error', async () => {
  const { done } = setup({ 'GET profiles': errorResponse(500, { message: 'db down' }) });
  try {
    const res = await quiet(() => handler(request({ force: true }, { token: SERVICE })));
    assertEquals(res.status, 500);
    await res.body?.cancel();
  } finally {
    done();
  }
  const pre = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  await pre.body?.cancel();
});
