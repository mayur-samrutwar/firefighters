import {
  getAgents,
  getActiveWorldEvents,
  getAgentLeaderboard,
  getBulletinPosts,
  getFires,
  getEarthLife,
  getLeaderboard,
  getTick,
  getUpdates,
  getWaterSources,
} from '@/app/game/store';
import { NextResponse } from 'next/server';

/** Collapse check runs every minute; next run is at the start of the next minute. */
function getNextCollapseCheckTime() {
  const now = new Date();
  const nextMinute = new Date(now);
  nextMinute.setMinutes(now.getMinutes() + 1);
  nextMinute.setSeconds(0);
  nextMinute.setMilliseconds(0);
  const ms = nextMinute.getTime() - now.getTime();
  const secondsUntilNext = Math.max(0, Math.floor(ms / 1000));
  return {
    nextRunAt: nextMinute.toISOString(),
    secondsUntilNext,
    formatted: `${Math.floor(secondsUntilNext / 60)}m ${secondsUntilNext % 60}s`,
  };
}

/** Hourly rewards cron (close hour + distribute/burn) runs at minute 0 of every hour. */
function getNextRewardsCronTime() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1);
  nextHour.setMinutes(0);
  nextHour.setSeconds(0);
  nextHour.setMilliseconds(0);
  const msUntilNext = nextHour.getTime() - now.getTime();
  const secondsUntilNext = Math.floor(msUntilNext / 1000);
  const minutesUntilNext = Math.floor(secondsUntilNext / 60);
  return {
    nextRunAt: nextHour.toISOString(),
    secondsUntilNext,
    minutesUntilNext,
    formatted: `${minutesUntilNext}m ${secondsUntilNext % 60}s`,
  };
}

export async function GET() {
  const [
    tick,
    fires,
    agents,
    updates,
    bulletin,
    leaderboard,
    agentLeaderboard,
    worldEvents,
    earthLife,
  ] = await Promise.all([
    getTick(),
    getFires(),
    getAgents(),
    getUpdates(),
    getBulletinPosts(),
    getLeaderboard(),
    getAgentLeaderboard(),
    getActiveWorldEvents(),
    getEarthLife(),
  ]);

  const nextCollapseCheck = getNextCollapseCheckTime();
  const nextRewardsCron = getNextRewardsCronTime();

  return NextResponse.json({
    tick,
    fires,
    agents,
    updates,
    waterSources: getWaterSources(),
    bulletin,
    leaderboard,
    agentLeaderboard,
    worldEvents,
    earthLife,
    nextCollapseCheck,
    nextRewardsCron,
  });
}
