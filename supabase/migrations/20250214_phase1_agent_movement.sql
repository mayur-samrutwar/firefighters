-- Phase 1: Agent movement, water, satellite routes
-- Add columns to agents for target, water, last_action, and satellite route state.

-- Nullable target (clear when arrived)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS target_lat numeric,
  ADD COLUMN IF NOT EXISTS target_lng numeric;

-- Water (level/capacity set by app on register)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS water_level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS water_capacity int NOT NULL DEFAULT 0;

-- Last action type for UI
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_action_type text;

-- Satellite route: waypoints [[lat,lng], ...], current segment index and t in [0,1)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS route jsonb,
  ADD COLUMN IF NOT EXISTS route_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS route_t numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.agents.route IS 'Satellite orbital waypoints: array of [lat, lng]';
COMMENT ON COLUMN public.agents.route_index IS 'Current segment (0 to len(route)-2)';
COMMENT ON COLUMN public.agents.route_t IS 'Position along segment 0..1';
