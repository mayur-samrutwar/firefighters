-- =====================================================
-- Supabase Cron Job Setup for Game Ticks
-- =====================================================
-- This sets up pg_cron to call /api/tick every 30 seconds
-- Requires: pg_cron and pg_net extensions enabled in Supabase
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configuration table for tick endpoint URL
CREATE TABLE IF NOT EXISTS game_tick_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_url text NOT NULL DEFAULT 'http://localhost:3000',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO game_tick_config (id, api_url, enabled)
VALUES (1, 'http://localhost:3000', true)
ON CONFLICT (id) DO NOTHING;

-- Function to call the tick endpoint using pg_net
CREATE OR REPLACE FUNCTION call_tick_endpoint()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  api_url text;
  request_id bigint;
BEGIN
  -- Get the API URL from config
  SELECT game_tick_config.api_url INTO api_url
  FROM game_tick_config
  WHERE id = 1 AND enabled = true;
  
  -- If no config or disabled, skip
  IF api_url IS NULL THEN
    RAISE NOTICE 'Tick cron job is disabled or API URL not configured';
    RETURN;
  END IF;
  
  -- Make HTTP POST request using pg_net
  SELECT net.http_post(
    url := api_url || '/api/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-pg_cron/1.0'
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  -- Note: pg_net is async, so we don't wait for response here
  -- The request will be processed by pg_net background workers
  RAISE NOTICE 'Tick endpoint request queued (request_id: %)', request_id;
END;
$$;

-- Schedule the cron job to run every minute
-- Note: pg_cron uses standard cron format (minute hour day month weekday)
-- For every 30 seconds, we schedule two jobs: one at :00 and one at :30
SELECT cron.schedule(
  'game-tick-every-minute',
  '* * * * *',  -- Every minute at :00 seconds
  $$SELECT call_tick_endpoint()$$
);

-- Schedule second job to run at :30 seconds (using sleep)
-- This runs every minute but sleeps 30 seconds first
SELECT cron.schedule(
  'game-tick-every-minute-30s',
  '* * * * *',  -- Every minute
  $$SELECT pg_sleep(30); SELECT call_tick_endpoint()$$
);

-- Note: If your Supabase instance supports pg_cron with second-level precision,
-- you can use: SELECT cron.schedule('game-tick', '*/30 * * * * *', $$SELECT call_tick_endpoint()$$);

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
    INSERT INTO game_tick_config (id, api_url, enabled)
    VALUES (1, new_url, true);
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
