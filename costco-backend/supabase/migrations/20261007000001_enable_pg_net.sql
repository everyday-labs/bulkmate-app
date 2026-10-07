-- pg_cron jobs call Edge Functions with net.http_post, which comes from the
-- pg_net extension. It was never enabled, so daily-price-match-sweep failed on
-- every run from 2026-06-27 to 2026-10-06 ("schema net does not exist") — the
-- 30-day sweep never ran; only the inline post-scan check did. Found while
-- testing the weekly-price-texts job, which needs it too.
CREATE EXTENSION IF NOT EXISTS pg_net;
