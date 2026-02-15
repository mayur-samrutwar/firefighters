-- Disable yearly and daily leaderboard crons; we only use hourly rewards (distribute on earth reset).

DO $$
BEGIN
  PERFORM cron.unschedule('yearly_leaderboard_rewards_jan1');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('leaderboard_snapshot_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
