import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import {
  type Call,
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
} from '../_testing/fakeSupabase.ts';

const USER = { id: 'user-1', email: 'sam@example.com', aud: 'authenticated' };
const SMS = 'POST https://api.brevo.com/v3/transactionalSMS/send';
const HOUR = 60 * 60 * 1000;

function setup(routes: Record<string, unknown> = {}) {
  const cleanup = setFunctionEnv({ BREVO_API_KEY: 'brevo-key' });
  const api = fakeSupabase({
    'GET auth/user': USER,
    'GET phone_verifications': [],
    'POST phone_verifications': null,
    'PATCH phone_verifications': null,
    'DELETE phone_verifications': null,
    'PATCH profiles': null,
    [SMS]: { messageId: 1 },
    ...routes,
  });
  return { api, done: () => (api.restore(), cleanup()) };
}

const call = (body: unknown) => quiet(() => handler(request(body, { token: 'jwt' })));

Deno.test('phone-verification: send texts a 6-digit code and stores only its hash', async () => {
  const { api, done } = setup();
  try {
    const res = await call({ action: 'send', phone: '+1 (555) 123-4567' });
    assertEquals(await res.json(), { sent: true });

    const sms = api.calls(SMS)[0].body as { recipient: string; content: string };
    assertEquals(sms.recipient, '15551234567');
    const code = sms.content.match(/code: (\d{6})/)![1];

    const row = api.calls('POST phone_verifications')[0].body as Record<string, unknown>;
    assertEquals(row.phone_number, '+15551234567');
    assertEquals(row.sends_in_window, 1);
    assertMatch(row.code_hash as string, /^[0-9a-f]{64}$/);
    assertEquals(JSON.stringify(row).includes(code), false);
  } finally {
    done();
  }
});

Deno.test('phone-verification: the texted code verifies and turns texts on', async () => {
  // Send first, then feed the stored row back to the verify step.
  const first = setup();
  let code = '';
  let stored: Record<string, unknown> = {};
  try {
    await call({ action: 'send', phone: '+15551234567' });
    code = (first.api.calls(SMS)[0].body as { content: string }).content.match(/code: (\d{6})/)![1];
    stored = first.api.calls('POST phone_verifications')[0].body as Record<string, unknown>;
  } finally {
    first.done();
  }

  const { api, done } = setup({ 'GET phone_verifications': stored });
  try {
    const res = await call({ action: 'verify', code });
    assertEquals(await res.json(), { verified: true, phone_number: '+15551234567' });
    const profile = api.calls('PATCH profiles')[0].body as Record<string, unknown>;
    assertEquals(profile.sms_alerts_enabled, true);
    assertEquals(profile.phone_number, '+15551234567');
    assertEquals(api.calls('DELETE phone_verifications').length, 1);
  } finally {
    done();
  }
});

Deno.test('phone-verification: a wrong code counts an attempt', async () => {
  const pending = {
    phone_number: '+15551234567',
    code_hash: 'f'.repeat(64),
    expires_at: new Date(Date.now() + HOUR).toISOString(),
    attempts: 2,
  };
  const { api, done } = setup({ 'GET phone_verifications': pending });
  try {
    const res = await call({ action: 'verify', code: '000000' });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, 'That code is incorrect.');
    assertEquals(api.calls('PATCH phone_verifications')[0].body, { attempts: 3 });
  } finally {
    done();
  }
});

Deno.test('phone-verification: expired codes and too many attempts are refused', async () => {
  const base = { phone_number: '+15551234567', code_hash: 'x', attempts: 0 };
  const cases: [unknown, number][] = [
    [[], 400], // nothing pending
    [{ ...base, expires_at: new Date(Date.now() - 1000).toISOString() }, 400],
    [{ ...base, attempts: 5, expires_at: new Date(Date.now() + HOUR).toISOString() }, 429],
  ];
  for (const [pending, status] of cases) {
    const { done } = setup({ 'GET phone_verifications': pending });
    try {
      const res = await call({ action: 'verify', code: '123456' });
      assertEquals(res.status, status);
      await res.body?.cancel();
    } finally {
      done();
    }
  }
});

Deno.test('phone-verification: send is rate-limited per day, and the window resets', async () => {
  const busy = setup({
    'GET phone_verifications': {
      sends_in_window: 5,
      window_started_at: new Date(Date.now() - HOUR).toISOString(),
    },
  });
  try {
    const res = await call({ action: 'send', phone: '+15551234567' });
    assertEquals(res.status, 429);
    await res.body?.cancel();
    assertEquals(busy.api.calls(SMS).length, 0);
  } finally {
    busy.done();
  }

  const stale = setup({
    'GET phone_verifications': {
      sends_in_window: 5,
      window_started_at: new Date(Date.now() - 25 * HOUR).toISOString(),
    },
  });
  try {
    const res = await call({ action: 'send', phone: '+15551234567' });
    assertEquals(res.status, 200);
    await res.body?.cancel();
    assertEquals(
      (stale.api.calls('POST phone_verifications')[0].body as { sends_in_window: number })
        .sends_in_window,
      1,
    );
  } finally {
    stale.done();
  }
});

Deno.test('phone-verification: validation, SMS failure and auth', async () => {
  const { api, done } = setup({
    [SMS]: (_: Call) => errorResponse(400, { message: 'invalid number' }),
  });
  try {
    assertEquals((await call({ action: 'send', phone: '5551234567' })).status, 400); // no country code
    assertEquals((await call({ action: 'send', phone: '+15551234567' })).status, 502);
    assertEquals((await call({ action: 'nope' })).status, 400);
    assertEquals(api.calls('POST phone_verifications').length, 0);
  } finally {
    done();
  }
  const unauth = setup({ 'GET auth/user': errorResponse(401, { message: 'bad jwt' }) });
  try {
    assertEquals((await call({ action: 'send', phone: '+15551234567' })).status, 401);
  } finally {
    unauth.done();
  }
});

Deno.test('phone-verification: a failed profile update is a server error', async () => {
  // Verify path with a matching hash but a failing profile write.
  const code = '123456';
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`user-1:${code}`)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const failing = setup({
    'GET phone_verifications': {
      phone_number: '+15551234567',
      code_hash: hash,
      expires_at: new Date(Date.now() + HOUR).toISOString(),
      attempts: 0,
    },
    'PATCH profiles': errorResponse(500, { message: 'db down' }),
  });
  try {
    const res = await call({ action: 'verify', code });
    assertEquals(res.status, 500);
    await res.body?.cancel();
  } finally {
    failing.done();
  }
  const res = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(res.status, 200);
  await res.body?.cancel();
});

Deno.test('phone-verification: codes are uniform 6-digit strings', async () => {
  // Statistical smoke test: with modulo bias the low codes would be favoured;
  // with rejection sampling, the first digit is ~uniform.
  const { api, done } = setup();
  const firstDigits = new Array(10).fill(0);
  try {
    for (let i = 0; i < 400; i++) {
      await call({ action: 'send', phone: '+15551234567' });
    }
    for (const c of api.calls(SMS)) {
      const code = (c.body as { content: string }).content.match(/code: (\d+)/)![1];
      assertEquals(code.length, 6);
      firstDigits[Number(code[0])]++;
    }
  } finally {
    done();
  }
  // Each digit expected ~40 times out of 400; allow wide statistical slack.
  for (const n of firstDigits) assertEquals(n > 10 && n < 80, true, `digit counts ${firstDigits}`);
});
