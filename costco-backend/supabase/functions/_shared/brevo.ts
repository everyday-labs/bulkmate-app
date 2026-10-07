// Brevo — transactional email and SMS for price-drop alerts (price-match-check
// emails immediately; weekly-price-texts sends the Friday SMS digest) and for
// phone-number verification codes (phone-verification).
//
// Auth emails (sign-up / password-reset codes) do NOT go through here — Supabase
// Auth sends those itself via Brevo's SMTP relay, configured in the dashboard.
//
// See ../../../EXTERNAL_APIS.md for details.

const API = 'https://api.brevo.com/v3';

function apiKey(): string | null {
  return Deno.env.get('BREVO_API_KEY') ?? null;
}

export type BrevoEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  tags?: string[];
};

/**
 * Sends one transactional email. Never throws — returns false (and logs) when
 * the key is missing or Brevo rejects the request, because a delivery failure
 * must never fail the work that triggered it (writing price_alerts rows).
 */
export async function sendBrevoEmail(email: BrevoEmail): Promise<boolean> {
  const key = apiKey();
  if (!key) {
    console.warn('Brevo: BREVO_API_KEY not set, skipping email');
    return false;
  }
  try {
    const res = await fetch(`${API}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: {
          email: Deno.env.get('BREVO_SENDER_EMAIL') ?? 'noreply@everyday-labs.org',
          name: Deno.env.get('BREVO_SENDER_NAME') ?? 'Bulkmate',
        },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        headers: email.headers,
        tags: email.tags,
      }),
    });
    if (!res.ok) {
      console.error(`Brevo email failed: HTTP ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Brevo email error:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Sends one SMS. `recipient` is E.164 (+15551234567); Brevo wants the digits
 * without the plus. Never throws, same reasoning as sendBrevoEmail.
 *
 * Keep `content` to plain GSM-7 characters (no emoji, curly quotes or dashes):
 * one non-GSM character switches the whole message to UCS-2, which drops the
 * single-SMS limit from 160 to 70 characters.
 */
export async function sendBrevoSms(recipient: string, content: string, tag: string): Promise<boolean> {
  const key = apiKey();
  if (!key) {
    console.warn('Brevo: BREVO_API_KEY not set, skipping SMS');
    return false;
  }
  try {
    const res = await fetch(`${API}/transactionalSMS/send`, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        // Alphanumeric senders (max 11 chars) aren't allowed in every country
        // (e.g. the US needs a registered number) — set BREVO_SMS_SENDER to
        // whatever Brevo assigns for the target market.
        sender: Deno.env.get('BREVO_SMS_SENDER') ?? 'Bulkmate',
        recipient: recipient.replace(/^\+/, ''),
        content,
        tag,
      }),
    });
    if (!res.ok) {
      console.error(`Brevo SMS failed: HTTP ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Brevo SMS error:', err instanceof Error ? err.message : err);
    return false;
  }
}
