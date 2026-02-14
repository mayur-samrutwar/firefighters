-- Fix Earth life staying at 100%: when earth_life_pct is NULL, treat as 100 so decay applies and we write a numeric value.

CREATE OR REPLACE FUNCTION public.game_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cur_tick bigint;
  cur_life numeric;
  new_tick bigint;
  lat_val numeric;
  lng_val numeric;
  ev_type text;
  ev_dur int;
  ev_params jsonb;
  fire_count int;
  total_intensity numeric;
  decay numeric;
  new_life numeric;
  r record;
  ev record;
  growth_prob numeric;
  new_intensity int;
  new_lat numeric;
  new_lng numeric;
  wind_dir text;
  drain_count int;
BEGIN
  SELECT tick, earth_life_pct INTO cur_tick, cur_life FROM public.game_state WHERE id = 1 FOR UPDATE;
  IF cur_tick IS NULL THEN
    RETURN;
  END IF;
  new_tick := cur_tick + 1;

  -- Spawn fire every 2 ticks, cap at 25 fires
  IF new_tick % 2 = 0 THEN
    SELECT count(*) INTO fire_count FROM public.fires;
    IF fire_count < 25 THEN
      lat_val := round((random() * 110 - 55)::numeric, 6);
      lng_val := round((random() * 360 - 180)::numeric, 6);
      INSERT INTO public.fires (lat, lng, intensity, created_tick, updated_tick)
      VALUES (lat_val, lng_val, floor(random() * 3 + 1)::int, new_tick, new_tick);
    END IF;
  END IF;

  -- World event ~every 2–3 minutes (prob 1/3 per tick)
  IF random() < (1.0 / 3.0) THEN
    ev_type := (ARRAY['lightning_storm','drought_zone','solar_flare','strong_winds','equipment_malfunction'])[floor(random() * 5 + 1)::int];
    ev_dur := floor(random() * 2 + 2)::int;
    ev_params := NULL;
    IF ev_type IN ('drought_zone', 'lightning_storm') THEN
      ev_params := jsonb_build_object('lat', round((random() * 110 - 55)::numeric, 6), 'lng', round((random() * 360 - 180)::numeric, 6));
    ELSIF ev_type = 'strong_winds' THEN
      ev_params := jsonb_build_object('direction', (ARRAY['n','s','e','w','ne','nw','se','sw'])[floor(random() * 8 + 1)::int]);
    END IF;
    INSERT INTO public.world_events (type, start_tick, duration_ticks, params)
    VALUES (ev_type, new_tick, ev_dur, ev_params);
  END IF;

  -- Fire growth: base 10%; drought_zone in zone +50%; lightning_storm +20%. Cap intensity 5.
  -- Strong winds: nudge fire lat/lng in wind direction (spread bias).
  FOR r IN SELECT id, lat, lng, intensity FROM public.fires
  LOOP
    growth_prob := 0.1;
    FOR ev IN
      SELECT type, params FROM public.world_events
      WHERE start_tick <= new_tick AND new_tick < start_tick + duration_ticks
    LOOP
      IF ev.type = 'drought_zone' AND ev.params IS NOT NULL
         AND (ev.params ? 'lat') AND (ev.params ? 'lng') THEN
        IF abs(r.lat - (ev.params->>'lat')::numeric) <= 15
           AND abs(r.lng - (ev.params->>'lng')::numeric) <= 15 THEN
          growth_prob := growth_prob + 0.5;
          EXIT;
        END IF;
      ELSIF ev.type = 'lightning_storm' THEN
        growth_prob := growth_prob + 0.2;
      END IF;
    END LOOP;
    IF random() < least(1.0, growth_prob) AND r.intensity < 5 THEN
      new_intensity := r.intensity + 1;
    ELSE
      new_intensity := r.intensity;
    END IF;

    new_lat := r.lat;
    new_lng := r.lng;
    FOR ev IN
      SELECT type, params FROM public.world_events
      WHERE start_tick <= new_tick AND new_tick < start_tick + duration_ticks
        AND type = 'strong_winds' AND params IS NOT NULL AND (params ? 'direction')
    LOOP
      wind_dir := ev.params->>'direction';
      IF wind_dir = 'n' THEN new_lat := new_lat + 0.25; ELSIF wind_dir = 's' THEN new_lat := new_lat - 0.25;
      ELSIF wind_dir = 'e' THEN new_lng := new_lng + 0.25; ELSIF wind_dir = 'w' THEN new_lng := new_lng - 0.25;
      ELSIF wind_dir = 'ne' THEN new_lat := new_lat + 0.18; new_lng := new_lng + 0.18;
      ELSIF wind_dir = 'nw' THEN new_lat := new_lat + 0.18; new_lng := new_lng - 0.18;
      ELSIF wind_dir = 'se' THEN new_lat := new_lat - 0.18; new_lng := new_lng + 0.18;
      ELSIF wind_dir = 'sw' THEN new_lat := new_lat - 0.18; new_lng := new_lng - 0.18;
      END IF;
      EXIT;
    END LOOP;
    new_lat := greatest(-85, least(85, round(new_lat::numeric, 6)));
    new_lng := round(new_lng::numeric, 6);
    IF new_lng > 180 THEN new_lng := new_lng - 360; ELSIF new_lng < -180 THEN new_lng := new_lng + 360; END IF;

    UPDATE public.fires SET intensity = new_intensity, lat = new_lat, lng = new_lng, updated_tick = new_tick WHERE id = r.id;
  END LOOP;

  -- Equipment malfunction: random subset of living agents lose extra 5% battery per tick
  IF EXISTS (
    SELECT 1 FROM public.world_events
    WHERE type = 'equipment_malfunction'
      AND start_tick <= new_tick AND new_tick < start_tick + duration_ticks
  ) THEN
    SELECT count(*)::int / 3 INTO drain_count FROM public.agents WHERE battery_pct > 0;
    drain_count := greatest(1, drain_count);
    UPDATE public.agents
    SET battery_pct = greatest(0, battery_pct - 5)
    WHERE id IN (
      SELECT id FROM public.agents
      WHERE battery_pct > 0
      ORDER BY random()
      LIMIT drain_count
    );
  END IF;

  -- Earth life decay: 0.002 per tick per intensity point (~5h survival with cap 25 fires)
  -- COALESCE(cur_life, 100): when earth_life_pct is NULL in DB, treat as 100 so decay runs and we write a number (UI was showing 100 due to ?? 100)
  SELECT coalesce(sum(intensity), 0) INTO total_intensity FROM public.fires;
  decay := 0.002 * total_intensity;
  new_life := greatest(0, coalesce(cur_life, 100)::numeric - decay);

  UPDATE public.game_state
  SET tick = new_tick, earth_life_pct = greatest(0, least(100, round(coalesce(new_life, 0))::int)), updated_at = now()
  WHERE id = 1;
END;
$$;
