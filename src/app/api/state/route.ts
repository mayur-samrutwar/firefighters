import {
  getAgents,
  getBulletinPosts,
  getFires,
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
  });
}
