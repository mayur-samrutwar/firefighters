-- Agent movement during tick: move toward target (ground agents), advance along route (satellite).
-- Speeds (deg/tick): scout 5, water_drone 3, heavy_tanker 1.5, supply_drone 3; satellite orbital 2.

CREATE OR REPLACE FUNCTION public.agent_movement_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  a record;
  spd numeric;
  dist_deg numeric;
  step numeric;
  new_lat numeric;
  new_lng numeric;
  rlen int;
  idx int;
  t numeric;
  lat0 numeric;
  lng0 numeric;
  lat1 numeric;
  lng1 numeric;
  seg_len numeric;
  advance numeric;
  orb_speed constant numeric := 2;
BEGIN
  FOR a IN
    SELECT id, type, lat, lng, target_lat, target_lng, route, route_index, route_t
    FROM public.agents
    WHERE battery_pct > 0
  LOOP
    -- Ground agents: move toward target
    IF a.type IN ('scout', 'water_drone', 'heavy_tanker', 'supply_drone')
       AND a.target_lat IS NOT NULL AND a.target_lng IS NOT NULL THEN
      spd := CASE a.type
        WHEN 'scout' THEN 5
        WHEN 'water_drone' THEN 3
        WHEN 'heavy_tanker' THEN 1.5
        WHEN 'supply_drone' THEN 3
        ELSE 0
      END;
      dist_deg := sqrt(
        (a.target_lat - a.lat) * (a.target_lat - a.lat) +
        (a.target_lng - a.lng) * (a.target_lng - a.lng)
      );
      IF dist_deg < 0.1 THEN
        UPDATE public.agents
        SET lat = a.target_lat, lng = a.target_lng, target_lat = NULL, target_lng = NULL
        WHERE id = a.id;
      ELSIF dist_deg > 0 THEN
        step := least(spd, dist_deg);
        new_lat := a.lat + (a.target_lat - a.lat) * (step / dist_deg);
        new_lng := a.lng + (a.target_lng - a.lng) * (step / dist_deg);
        new_lng := CASE WHEN new_lng > 180 THEN new_lng - 360 WHEN new_lng < -180 THEN new_lng + 360 ELSE new_lng END;
        UPDATE public.agents SET lat = new_lat, lng = new_lng WHERE id = a.id;
      END IF;
      CONTINUE;
    END IF;

    -- Satellite: advance along route
    IF a.type = 'satellite' AND a.route IS NOT NULL THEN
      rlen := jsonb_array_length(a.route);
      IF rlen < 2 THEN
        CONTINUE;
      END IF;
      idx := (a.route_index)::int;
      IF idx < 0 THEN idx := 0; END IF;
      IF idx >= rlen - 1 THEN idx := rlen - 2; END IF;

      lat0 := (a.route->idx->>0)::numeric;
      lng0 := (a.route->idx->>1)::numeric;
      lat1 := (a.route->(idx+1)->>0)::numeric;
      lng1 := (a.route->(idx+1)->>1)::numeric;
      seg_len := sqrt((lat1 - lat0)*(lat1 - lat0) + (lng1 - lng0)*(lng1 - lng0));
      IF seg_len < 0.001 THEN seg_len := 0.001; END IF;
      advance := orb_speed / seg_len;
      t := (a.route_t)::numeric + advance;

      IF t >= 1 THEN
        idx := idx + 1;
        t := 0;
        IF idx >= rlen - 1 THEN
          idx := 0;
        END IF;
        lat0 := (a.route->idx->>0)::numeric;
        lng0 := (a.route->idx->>1)::numeric;
        lat1 := (a.route->(idx+1)->>0)::numeric;
        lng1 := (a.route->(idx+1)->>1)::numeric;
      END IF;

      new_lat := lat0 + (lat1 - lat0) * t;
      new_lng := lng0 + (lng1 - lng0) * t;
      new_lat := greatest(-90, least(90, new_lat));
      new_lng := CASE WHEN new_lng > 180 THEN new_lng - 360 WHEN new_lng < -180 THEN new_lng + 360 ELSE new_lng END;

      UPDATE public.agents
      SET lat = new_lat, lng = new_lng, route_index = idx, route_t = t
      WHERE id = a.id;
    END IF;
  END LOOP;
END;
$$;

-- Run both game_tick and agent_movement_tick each cron
CREATE OR REPLACE FUNCTION public.run_ticks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.game_tick();
  PERFORM public.agent_movement_tick();
END;
$$;
