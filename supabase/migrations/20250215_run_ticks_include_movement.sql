-- run_ticks was overwritten by tick_cron to only call game_tick().
-- This migration runs after tick_cron so it restores the version that also runs agent_movement_tick().

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
