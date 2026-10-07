-- Weekly price-drop texts are paused for v1 (email-only alerts): US texting
-- needs a registered sender number and paid SMS credits. Everything else stays
-- in place (columns, guard trigger, phone_verifications, the function code), so
-- re-enabling is: redeploy phone-verification + weekly-price-texts, flip
-- SMS_ALERTS_ENABLED in costco-mobile/lib/features.ts, and re-run the DO block
-- from 20261007000000_notification_channels.sql to re-schedule this job.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'weekly-price-texts';

-- Nobody could have opted in yet, but make sure no one is left opted in.
UPDATE profiles SET sms_alerts_enabled = false WHERE sms_alerts_enabled;
