// Signed one-click unsubscribe links for price-drop emails. The link carries
// the user id plus an HMAC of it, so email-unsubscribe can act without a
// session (it's opened from a mail client) and nobody can unsubscribe someone
// else by guessing ids. Key: NOTIFY_LINK_SECRET (Edge Function secret).

const encoder = new TextEncoder();

async function hmacHex(message: string): Promise<string> {
  const secret = Deno.env.get('NOTIFY_LINK_SECRET');
  if (!secret) throw new Error('NOTIFY_LINK_SECRET not set');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`unsubscribe:${message}`)),
  );
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubscribeUrl(userId: string): Promise<string> {
  const base = Deno.env.get('SUPABASE_URL')!;
  return `${base}/functions/v1/email-unsubscribe?u=${encodeURIComponent(userId)}&t=${await hmacHex(userId)}`;
}

/** Constant-time check of a token from an unsubscribe link. */
export async function verifyUnsubscribeToken(userId: string, token: string): Promise<boolean> {
  const expected = await hmacHex(userId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
