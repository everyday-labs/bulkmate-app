// Feature flags for things that are built but not shipped yet.

// Weekly price-drop texts (Brevo SMS) are fully built — verify-phone screen,
// phone-verification + weekly-price-texts Edge Functions, DB columns — but
// paused for v1: US texting needs a registered sender number and paid SMS
// credits. To turn on: set this true, redeploy both functions, and re-schedule
// the pg_cron job (see migration 20261007000002_pause_sms_for_v1.sql).
export const SMS_ALERTS_ENABLED = false;
