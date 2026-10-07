import { assert, assertFalse } from 'jsr:@std/assert@1';
import { isServiceRole } from './auth.ts';

// Unsigned test tokens — the gateway checks signatures, isServiceRole only
// reads the role claim.
function token(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}

const req = (auth?: string) =>
  new Request('https://example.com', { headers: auth ? { Authorization: auth } : {} });

Deno.test('isServiceRole: service-role key passes', () => {
  assert(isServiceRole(req(`Bearer ${token({ role: 'service_role' })}`)));
});

Deno.test('isServiceRole: anon key and user tokens are rejected', () => {
  assertFalse(isServiceRole(req(`Bearer ${token({ role: 'anon' })}`)));
  assertFalse(isServiceRole(req(`Bearer ${token({ role: 'authenticated', sub: 'u1' })}`)));
});

Deno.test('isServiceRole: missing or malformed header is rejected', () => {
  assertFalse(isServiceRole(req()));
  assertFalse(isServiceRole(req('Bearer not-a-jwt')));
  assertFalse(isServiceRole(req('Bearer a.%%%.c')));
});
