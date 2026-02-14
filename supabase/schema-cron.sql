-- =====================================================
-- Supabase Cron Job Setup for Game Ticks
-- =====================================================
-- This sets up pg_cron to call /api/tick every 10 seconds (game is tuned for 10s ticks)
-- Requires: pg_cron and pg_net extensions enabled in Supabase
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configuration table for tick endpoint URL and secret
CREATE TABLE IF NOT EXISTS game_tick_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_url text NOT NULL DEFAULT 'https://firefighters-six.vercel.app/',
  api_secret text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO game_tick_config (id, api_url, api_secret, enabled)
VALUES (1, 'https://firefighters-six.vercel.app/', '', true)
ON CONFLICT (id) DO NOTHING;

-- Function to call the tick endpoint using pg_net
CREATE OR REPLACE FUNCTION call_tick_endpoint()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_url text;
  api_secret text;
  request_id bigint;
  headers jsonb;
BEGIN
  -- Get the API URL and secret from config
  SELECT game_tick_config.api_url, game_tick_config.api_secret
  INTO api_url, api_secret
  FROM game_tick_config
  WHERE id = 1 AND enabled = true;
  
  -- If no config or disabled, skip
  IF api_url IS NULL THEN
    RAISE NOTICE 'Tick cron job is disabled or API URL not configured';
    RETURN;
  END IF;
  
  -- Build headers with Authorization if secret is configured
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'User-Agent', 'Supabase-pg_cron/1.0'
  );
  
  IF api_secret IS NOT NULL AND api_secret != '' THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || api_secret);
  END IF;
  
  -- Make HTTP POST request using pg_net
  SELECT net.http_post(
    url := api_url || '/api/tick',
    headers := headers,
    body := '{}'::jsonb
  ) INTO request_id;
  
  -- Note: pg_net is async, so we don't wait for response here
  -- The request will be processed by pg_net background workers
  RAISE NOTICE 'Tick endpoint request queued (request_id: %)', request_id;
END;
$$;

-- Schedule tick job: 6 ticks per minute (every 10 seconds)
-- pg_cron has minute precision only, so we run once per minute and do 6 calls with 10s sleep between
-- If you had the previous 30s job, run: SELECT cron.unschedule('game-tick-every-30s');
SELECT cron.schedule(
  'game-tick-every-10s',
  '* * * * *',
  $$SELECT call_tick_endpoint(); SELECT pg_sleep(10); SELECT call_tick_endpoint(); SELECT pg_sleep(10); SELECT call_tick_endpoint(); SELECT pg_sleep(10); SELECT call_tick_endpoint(); SELECT pg_sleep(10); SELECT call_tick_endpoint(); SELECT pg_sleep(10); SELECT call_tick_endpoint();$$
);

-- Helper function to update the API URL
CREATE OR REPLACE FUNCTION set_tick_api_url(new_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE game_tick_config
  SET api_url = new_url, updated_at = now()
  WHERE id = 1;
  
  IF NOT FOUND THEN
    INSERT INTO game_tick_config (id, api_url, api_secret, enabled)
    VALUES (1, new_url, '', true);
  END IF;
END;
$$;

-- Helper function to set the API secret
CREATE OR REPLACE FUNCTION set_tick_api_secret(new_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE game_tick_config
  SET api_secret = new_secret, updated_at = now()
  WHERE id = 1;
  
  IF NOT FOUND THEN
    INSERT INTO game_tick_config (id, api_url, api_secret, enabled)
    VALUES (1, 'https://firefighters-six.vercel.app/', new_secret, true);
  END IF;
END;
$$;

-- Helper function to enable/disable the cron job
CREATE OR REPLACE FUNCTION toggle_tick_cron(enabled_state boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE game_tick_config
  SET enabled = enabled_state, updated_at = now()
  WHERE id = 1;
END;
$$;

-- View to check cron job status
CREATE OR REPLACE VIEW tick_cron_status AS
SELECT 
  c.jobid,
  c.jobname,
  c.schedule,
  c.command,
  c.nodename,
  c.nodeport,
  c.database,
  c.username,
  c.active,
  c.jobid::text || '-' || c.jobname as job_key
FROM cron.job c
WHERE c.jobname LIKE 'game-tick%';

-- =====================================================
-- Hourly rewards cron job
-- =====================================================

-- Function to call the hourly rewards endpoint
CREATE OR REPLACE FUNCTION call_rewards_endpoint()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_url text;
  api_secret text;
  request_id bigint;
  headers jsonb;
BEGIN
  -- Get the API URL and secret from config
  SELECT game_tick_config.api_url, game_tick_config.api_secret
  INTO api_url, api_secret
  FROM game_tick_config
  WHERE id = 1 AND enabled = true;
  
  IF api_url IS NULL THEN
    RAISE NOTICE 'Rewards cron job disabled or API URL not configured';
    RETURN;
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'User-Agent', 'Supabase-pg_cron/1.0'
  );

  IF api_secret IS NOT NULL AND api_secret != '' THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || api_secret);
  END IF;

  SELECT net.http_post(
    url := api_url || '/api/cron/rewards',
    headers := headers,
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Rewards endpoint request queued (request_id: %)', request_id;
END;
$$;

-- Schedule rewards cron to run hourly (close hour + distribute/burn)
SELECT cron.schedule(
  'game-rewards-hourly',
  '0 * * * *', -- at minute 0 of every hour
  $$SELECT call_rewards_endpoint()$$
);

-- =====================================================
-- Collapse check — every minute (reset soon after earth life hits 0)
-- =====================================================

CREATE OR REPLACE FUNCTION call_check_collapse_endpoint()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_url text;
  api_secret text;
  request_id bigint;
  headers jsonb;
BEGIN
  SELECT game_tick_config.api_url, game_tick_config.api_secret
  INTO api_url, api_secret
  FROM game_tick_config
  WHERE id = 1 AND enabled = true;

  IF api_url IS NULL THEN
    RETURN;
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'User-Agent', 'Supabase-pg_cron/1.0'
  );
  IF api_secret IS NOT NULL AND api_secret != '' THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || api_secret);
  END IF;

  SELECT net.http_post(
    url := api_url || '/api/cron/check-collapse',
    headers := headers,
    body := '{}'::jsonb
  ) INTO request_id;
END;
$$;

-- Run collapse check every minute (so earth at 0 is reset within ~1 min)
SELECT cron.schedule(
  'game-check-collapse-every-minute',
  '* * * * *', -- every minute
  $$SELECT call_check_collapse_endpoint()$$
);
