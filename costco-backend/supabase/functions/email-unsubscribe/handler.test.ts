import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import { unsubscribeUrl } from '../_shared/notifyLinks.ts';
import { errorResponse, fakeSupabase, quiet, setFunctionEnv } from '../_testing/fakeSupabase.ts';

const USER = '6f1c2a3b-0000-4000-8000-000000000001';

async function signedLink() {
  const link = new URL(await unsubscribeUrl(USER));
  return `https://fn.local/?u=${link.searchParams.get('u')}&t=${link.searchParams.get('t')}`;
}

Deno.test(
  'email-unsubscribe: a valid GET link turns email alerts off and shows a page',
  async () => {
    const cleanup = setFunctionEnv();
    const api = fakeSupabase({ 'PATCH profiles': null });
    try {
      const res = await handler(new Request(await signedLink()));
      assertEquals(res.status, 200);
      assertStringIncludes(await res.text(), 'unsubscribed');
      const [patch] = api.calls('PATCH profiles');
      assertEquals(patch.body, { email_alerts_enabled: false });
      assertEquals(patch.params.get('id'), `eq.${USER}`);
    } finally {
      api.restore();
      cleanup();
    }
  },
);

Deno.test('email-unsubscribe: RFC 8058 one-click POST returns 204', async () => {
  const cleanup = setFunctionEnv();
  const api = fakeSupabase({ 'PATCH profiles': null });
  try {
    const res = await handler(new Request(await signedLink(), { method: 'POST' }));
    assertEquals(res.status, 204);
  } finally {
    api.restore();
    cleanup();
  }
});

Deno.test('email-unsubscribe: tampered or missing tokens change nothing', async () => {
  const cleanup = setFunctionEnv();
  const api = fakeSupabase({});
  try {
    const bad = await handler(new Request(`https://fn.local/?u=${USER}&t=${'0'.repeat(64)}`));
    assertEquals(bad.status, 400);
    assertStringIncludes(await bad.text(), 'Link not valid');
    const missing = await handler(new Request('https://fn.local/'));
    assertEquals(missing.status, 400);
    await missing.body?.cancel();
    assertEquals(api.calls().length, 0);
  } finally {
    api.restore();
    cleanup();
  }
});

Deno.test('email-unsubscribe: other methods are rejected', async () => {
  const res = await handler(new Request('https://fn.local/', { method: 'DELETE' }));
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('email-unsubscribe: a database failure shows an error page', async () => {
  const cleanup = setFunctionEnv();
  const api = fakeSupabase({ 'PATCH profiles': errorResponse(500, { message: 'db down' }) });
  try {
    const res = await quiet(async () => handler(new Request(await signedLink())));
    assertEquals(res.status, 500);
    assertStringIncludes(await res.text(), 'Something went wrong');
  } finally {
    api.restore();
    cleanup();
  }
});
