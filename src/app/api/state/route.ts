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
  });
}
