// Brevo's free plan allows 300 emails a day across *everything* — sign-up and
// password-reset codes (via the SMTP relay) share it with price-drop emails.
// price-match-check therefore caps its own sends per UTC day, leaving the rest
// for auth codes. An alert that misses the cap keeps emailed_at = null and goes
// out on the next run.

export const DEFAULT_ALERT_EMAIL_DAILY_CAP = 200;

export function alertEmailDailyCap(): number {
  const raw = Number(Deno.env.get('ALERT_EMAIL_DAILY_CAP'));
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_ALERT_EMAIL_DAILY_CAP;
}

/** Start of the current UTC day, as an ISO string. */
export function utcDayStart(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Emails already sent today, from price_alerts rows emailed since utcDayStart.
 * Every alert in one email is stamped with that email's single timestamp, so
 * one (user, emailed_at) pair is one email.
 */
export function countEmailsSent(rows: { user_id: string; emailed_at: string }[]): number {
  return new Set(rows.map((r) => `${r.user_id}|${r.emailed_at}`)).size;
}
