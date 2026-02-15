-- Cron jobs that call the app API for treasury-on-earth-reset, leaderboard snapshot, and yearly rewards.
-- Requires: pg_net extension (enable in Supabase Dashboard → Database → Extensions).
-- Configure: INSERT into app_cron_config (key, value) VALUES ('cron_base_url', 'https://your-app.vercel.app'), ('cron_secret', 'your-TICK_API_SECRET') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.app_cron_config (
  key text PRIMARY KEY,
  value text
);

COMMENT ON TABLE public.app_cron_config IS 'Configure cron HTTP calls: cron_base_url (app root URL), cron_secret (same as TICK_API_SECRET)';

-- Call app cron endpoint via pg_net. No-op if cron_base_url is null or empty.
CREATE OR REPLACE FUNCTION public.call_cron_api(path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url text;
  secret_val text;
  url text;
  req_id bigint;
BEGIN
  SELECT value INTO base_url FROM public.app_cron_config WHERE key = 'cron_base_url';
  SELECT value INTO secret_val FROM public.app_cron_config WHERE key = 'cron_secret';
  IF base_url IS NULL OR trim(base_url) = '' THEN
    RETURN;
  END IF;
  url := rtrim(base_url, '/') || path;
  SELECT net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(secret_val, '')
    ),
    timeout_milliseconds := 30000
  ) INTO req_id;
END;
$$;

-- Run every minute: process earth resets (closeHour + burn, record yearly_collections)
DO $$
BEGIN
  PERFORM cron.unschedule('process_earth_reset_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'process_earth_reset_every_minute',
  '* * * * *',
  $$SELECT public.call_cron_api('/api/cron/treasury-on-earth-reset');$$
);

-- Run daily at 01:00 UTC: snapshot leaderboard for yearly rewards
DO $$
BEGIN
  PERFORM cron.unschedule('leaderboard_snapshot_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'leaderboard_snapshot_daily',
  '0 1 * * *',
  $$SELECT public.call_cron_api('/api/cron/leaderboard-snapshot');$$
);

-- Run yearly on Jan 1 at 02:00 UTC: distribute 0.90% of last year's collections to leaderboard
DO $$
BEGIN
  PERFORM cron.unschedule('yearly_leaderboard_rewards_jan1');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'yearly_leaderboard_rewards_jan1',
  '0 2 1 1 *',
  $$SELECT public.call_cron_api('/api/cron/yearly-leaderboard-rewards');$$
);
