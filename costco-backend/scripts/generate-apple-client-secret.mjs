#!/usr/bin/env node
// One-time developer tool — generates the "Secret Key" value that Supabase's
// Apple auth provider expects.
//
// Why this exists: Supabase's Apple provider field is labelled "Secret Key",
// but it does NOT accept the .p8 private key Apple gives you. It wants a
// *client secret JWT* signed with that key (ES256). Pasting the raw .p8
// produces "Secret key should be a JWT."
//
// Apple's required claims (per Apple's "Generate and validate tokens" docs):
//   header.kid = your Key ID          header.alg = ES256
//   iss = your Team ID                sub = your client ID
//   aud = https://appleid.apple.com   exp = max 6 months from iat
//
// The private key is read from disk and never printed. Only the resulting
// JWT is written to stdout.
//
// Usage:
//   node scripts/generate-apple-client-secret.mjs \
//     --key ~/Downloads/AuthKey_ABC123XYZ.p8 \
//     --key-id ABC123XYZ \
//     --team-id XX3T25NCVV \
//     --client-id com.twonk0609.costco-app

import { readFileSync } from 'node:fs';
import { createSign, createPrivateKey } from 'node:crypto';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const keyPath = arg('key');
const keyId = arg('key-id');
const teamId = arg('team-id');
const clientId = arg('client-id');

if (!keyPath || !keyId || !teamId || !clientId) {
  console.error('Missing required argument.\n');
  console.error('Usage:');
  console.error('  node scripts/generate-apple-client-secret.mjs \\');
  console.error('    --key <path to AuthKey_XXXX.p8> \\');
  console.error('    --key-id <Key ID from Apple> \\');
  console.error('    --team-id <your Apple Team ID> \\');
  console.error('    --client-id <bundle ID for native, or Services ID for web>');
  process.exit(1);
}

const base64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

let privateKey;
try {
  // createPrivateKey validates it's a real PKCS#8 EC key before we try to sign,
  // so a wrong/corrupt file fails here with a clear message instead of
  // producing a subtly invalid token.
  privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));
} catch (err) {
  console.error(`Could not read a valid private key from: ${keyPath}`);
  console.error(`(${err.message})`);
  console.error(
    '\nExpected the .p8 file Apple gives you, starting with "-----BEGIN PRIVATE KEY-----".',
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
// Apple caps client-secret lifetime at 6 months (15777000s). Using the max
// means you re-generate this twice a year rather than constantly.
const SIX_MONTHS = 15777000;
const exp = now + SIX_MONTHS;

const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: clientId,
};

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

const signer = createSign('SHA256');
signer.update(signingInput);
signer.end();
// JWS requires the raw r||s pair (IEEE P1363), not the DER encoding Node
// returns by default — without this the token is rejected as malformed.
const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

const jwt = `${signingInput}.${signature.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

console.log(
  '\n=== Paste this into Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)" ===\n',
);
console.log(jwt);
console.log(
  `\nExpires: ${new Date(exp * 1000).toISOString().slice(0, 10)} (Apple's 6-month max — regenerate before then)\n`,
);
