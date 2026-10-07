import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendBrevoSms } from '../_shared/brevo.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// Verifies a phone number by SMS code before weekly price-drop texts can be
// switched on. Texting an unverified number risks messaging a stranger who
// never consented — the profile's free-text phone field is not enough.
//
//   { action: 'send',   phone: '+15551234567' }  → texts a 6-digit code
//   { action: 'verify', code: '123456' }         → on success, saves the number
//                                                   as verified and opts in
//
// The user is always the caller (from the JWT). Codes expire after 10 minutes,
// allow 5 guesses, and at most 5 codes go out per user per 24 hours (each one is
// a paid SMS). Only a SHA-256 hash of the code is stored.

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_DAY = 5;
const E164 = /^\+[1-9]\d{7,14}$/;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as { action?: string; phone?: string; code?: string };

    if (body.action === 'send') {
      const phone = (body.phone ?? '').replace(/[\s()-]/g, '');
      if (!E164.test(phone)) {
        return json(
          { error: 'Enter the number with its country code, e.g. +1 555 123 4567.' },
          400,
        );
      }

      const { data: pending } = await supabase
        .from('phone_verifications')
        .select('sends_in_window, window_started_at')
        .eq('user_id', user.id)
        .maybeSingle();

      const windowFresh =
        pending && Date.now() - new Date(pending.window_started_at).getTime() < 24 * 60 * 60 * 1000;
      const sendsInWindow = windowFresh ? pending.sends_in_window : 0;
      if (sendsInWindow >= MAX_SENDS_PER_DAY) {
        return json({ error: 'Too many codes requested. Try again tomorrow.' }, 429);
      }

      const code = sixDigitCode();
      const sent = await sendBrevoSms(
        phone,
        `Bulkmate code: ${code}. Enter it in the app to turn on weekly price-drop texts. Not you? Ignore this message.`,
        'phone-verification',
      );
      if (!sent)
        return json(
          { error: "Couldn't send a text to that number right now. Try again later." },
          502,
        );

      await supabase.from('phone_verifications').upsert({
        user_id: user.id,
        phone_number: phone,
        code_hash: await sha256Hex(`${user.id}:${code}`),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        attempts: 0,
        sends_in_window: sendsInWindow + 1,
        window_started_at: windowFresh ? pending!.window_started_at : new Date().toISOString(),
      });
      return json({ sent: true });
    }

    if (body.action === 'verify') {
      const code = (body.code ?? '').trim();
      const { data: pending } = await supabase
        .from('phone_verifications')
        .select('phone_number, code_hash, expires_at, attempts')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
        return json({ error: 'That code has expired. Request a new one.' }, 400);
      }
      if (pending.attempts >= MAX_ATTEMPTS) {
        return json({ error: 'Too many attempts. Request a new code.' }, 429);
      }
      if ((await sha256Hex(`${user.id}:${code}`)) !== pending.code_hash) {
        await supabase
          .from('phone_verifications')
          .update({ attempts: pending.attempts + 1 })
          .eq('user_id', user.id);
        return json({ error: 'That code is incorrect.' }, 400);
      }

      // Service role: the guard_phone_verification trigger lets this write the
      // number and the verification together.
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          phone_number: pending.phone_number,
          phone_verified_at: new Date().toISOString(),
          sms_alerts_enabled: true,
        })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      await supabase.from('phone_verifications').delete().eq('user_id', user.id);
      return json({ verified: true, phone_number: pending.phone_number });
    }

    return json({ error: "action must be 'send' or 'verify'" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('phone-verification error:', message);
    await capturePostHogException(err, { functionName: 'phone-verification' });
    return json({ error: message }, 500);
  }
}
