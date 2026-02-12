import { getBulletinPosts } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    posts: getBulletinPosts(),
  });
}
