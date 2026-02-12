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
  return NextResponse.json({
    tick: getTick(),
    fires: getFires(),
    agents: getAgents(),
    updates: getUpdates(),
    waterSources: getWaterSources(),
    bulletin: getBulletinPosts(),
    leaderboard: getLeaderboard(), // legacy player leaderboard (may be empty)
    agentLeaderboard: getAgentLeaderboard(),
    worldEvents: getActiveWorldEvents(),
    earthLife: getEarthLife(),
  });
}
