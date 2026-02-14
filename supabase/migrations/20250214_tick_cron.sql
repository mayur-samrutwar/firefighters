-- Enable pg_cron (Supabase usually has it; ignore if already on)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres (required for cron to run)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Single tick: increment game_state.tick, optionally spawn fire (every 12 ticks), optionally spawn world event (prob 1/22)
CREATE OR REPLACE FUNCTION public.game_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cur_tick bigint;
  new_tick bigint;
  lat_val numeric;
  lng_val numeric;
  ev_type text;
  ev_dur int;
  ev_params jsonb;
BEGIN
  SELECT tick INTO cur_tick FROM public.game_state WHERE id = 1 FOR UPDATE;
  IF cur_tick IS NULL THEN
    RETURN;
  END IF;
  new_tick := cur_tick + 1;

  -- Spawn fire every 12 ticks (2 min at 6 ticks/min)
  IF new_tick % 12 = 0 THEN
    lat_val := round((random() * 110 - 55)::numeric, 6);
    lng_val := round((random() * 360 - 180)::numeric, 6);
    INSERT INTO public.fires (lat, lng, intensity, created_tick, updated_tick)
    VALUES (lat_val, lng_val, floor(random() * 3 + 1)::int, new_tick, new_tick);
  END IF;

  -- World event with probability ~1/22
  IF random() < (1.0 / 22.0) THEN
    ev_type := (ARRAY['lightning_storm','drought_zone','solar_flare','strong_winds','equipment_malfunction'])[floor(random() * 5 + 1)::int];
    ev_dur := floor(random() * 13 + 6)::int;
    ev_params := NULL;
    IF ev_type IN ('drought_zone', 'lightning_storm') THEN
      ev_params := jsonb_build_object('lat', round((random() * 110 - 55)::numeric, 6), 'lng', round((random() * 360 - 180)::numeric, 6));
    ELSIF ev_type = 'strong_winds' THEN
      ev_params := jsonb_build_object('direction', (ARRAY['n','s','e','w','ne','nw','se','sw'])[floor(random() * 8 + 1)::int]);
    END IF;
    INSERT INTO public.world_events (type, start_tick, duration_ticks, params)
    VALUES (ev_type, new_tick, ev_dur, ev_params);
  END IF;

  UPDATE public.game_state SET tick = new_tick, updated_at = now() WHERE id = 1;
END;
$$;

-- Run 6 ticks (equivalent to 6 × 10s = 1 min when cron runs every minute)
CREATE OR REPLACE FUNCTION public.run_ticks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.game_tick();
  PERFORM public.game_tick();
  PERFORM public.game_tick();
  PERFORM public.game_tick();
  PERFORM public.game_tick();
  PERFORM public.game_tick();
END;
$$;

-- Remove existing job if present (so we can re-run this migration)
DO $$
BEGIN
  PERFORM cron.unschedule('game_tick_every_minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every minute, run 6 ticks (~10s tick rate)
SELECT cron.schedule(
  'game_tick_every_minute',
  '* * * * *',
  'SELECT public.run_ticks();'
);
