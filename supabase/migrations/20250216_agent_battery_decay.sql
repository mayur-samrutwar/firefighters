-- Battery decay per tick: each agent loses battery based on last_action_type.
-- Multipliers match src/data/actions.ts. Base drain ~3.33% per tick at 1.0 => ~30 min to empty when active.

CREATE OR REPLACE FUNCTION public.agent_battery_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_drain_pct constant numeric := 3.33;
BEGIN
  UPDATE public.agents a
  SET battery_pct = greatest(0, (
    round(a.battery_pct::numeric - base_drain_pct * (
      CASE a.last_action_type
        WHEN 'no_op' THEN 0.5
        WHEN 'sit_idle' THEN 0.45
        WHEN 'post_bulletin' THEN 1.0
        WHEN 'acknowledge_task' THEN 1.0
        WHEN 'abort_current' THEN 0.9
        WHEN 'view_global_state' THEN 1.0
        WHEN 'set_scan_focus' THEN 1.15
        WHEN 'change_route' THEN 1.0
        WHEN 'prioritize_scan_zone' THEN 1.2
        WHEN 'move_to' THEN 1.3
        WHEN 'investigate_fire' THEN 1.4
        WHEN 'mark_false_alarm' THEN 1.0
        WHEN 'water_fire' THEN 1.55
        WHEN 'refill' THEN 1.5
        WHEN 'request_backup' THEN 1.0
        WHEN 'recharge_agent' THEN 1.5
        WHEN 'emergency_recharge' THEN 1.75
        ELSE 1.0
      END
    ))::int
  ))
  WHERE a.battery_pct > 0;
END;
$$;

-- Run battery decay after movement each tick.
CREATE OR REPLACE FUNCTION public.run_ticks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.game_tick();
  PERFORM public.agent_movement_tick();
  PERFORM public.agent_battery_tick();
END;
$$;
