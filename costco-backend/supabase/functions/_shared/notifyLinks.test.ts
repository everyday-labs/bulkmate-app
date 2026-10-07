// Needs --allow-env (sets NOTIFY_LINK_SECRET / SUPABASE_URL for the test).
import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1';
import { unsubscribeUrl, verifyUnsubscribeToken } from './notifyLinks.ts';

const USER = '6f1c2a3b-0000-4000-8000-000000000001';
const OTHER = '6f1c2a3b-0000-4000-8000-000000000002';

function withEnv(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set('NOTIFY_LINK_SECRET', 'test-secret');
    Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
    try {
      await fn();
    } finally {
      Deno.env.delete('NOTIFY_LINK_SECRET');
      Deno.env.delete('SUPABASE_URL');
    }
  };
}

const tokenFor = async (userId: string) =>
  new URL(await unsubscribeUrl(userId)).searchParams.get('t')!;

Deno.test(
  'unsubscribe URL points at email-unsubscribe with user id and token',
  withEnv(async () => {
    const url = new URL(await unsubscribeUrl(USER));
    assertEquals(
      url.origin + url.pathname,
      'https://example.supabase.co/functions/v1/email-unsubscribe',
    );
    assertEquals(url.searchParams.get('u'), USER);
    assert(/^[0-9a-f]{64}$/.test(url.searchParams.get('t')!), 'token is a hex SHA-256 HMAC');
  }),
);

Deno.test(
  'a link verifies only for its own user',
  withEnv(async () => {
    const token = await tokenFor(USER);
    assert(await verifyUnsubscribeToken(USER, token));
    assertFalse(await verifyUnsubscribeToken(OTHER, token));
  }),
);

Deno.test(
  'tampered or truncated tokens are rejected',
  withEnv(async () => {
    const token = await tokenFor(USER);
    const flipped = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
    assertFalse(await verifyUnsubscribeToken(USER, flipped));
    assertFalse(await verifyUnsubscribeToken(USER, token.slice(0, 32)));
    assertFalse(await verifyUnsubscribeToken(USER, ''));
  }),
);

Deno.test(
  'a different secret produces a different token',
  withEnv(async () => {
    const token = await tokenFor(USER);
    Deno.env.set('NOTIFY_LINK_SECRET', 'rotated-secret');
    assertFalse(await verifyUnsubscribeToken(USER, token));
  }),
);

Deno.test('missing NOTIFY_LINK_SECRET fails loudly', async () => {
  Deno.env.delete('NOTIFY_LINK_SECRET');
  await assertRejects(() => verifyUnsubscribeToken(USER, 'x'), Error, 'NOTIFY_LINK_SECRET not set');
});
