-- paid_for_life_wei: totalPaid (wei) that bought this agent's current life.
-- When dead (battery 0), we require totalPaid > paid_for_life_wei to revive (they pay again).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'paid_for_life_wei'
  ) THEN
    ALTER TABLE public.agents ADD COLUMN paid_for_life_wei numeric;
  END IF;
END $$;
