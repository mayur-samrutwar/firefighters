import { getBulletinPosts } from '@/app/game/store';
import { NextResponse } from 'next/server';

async function bulletinResponse() {
  const posts = await getBulletinPosts();
  return NextResponse.json({ posts });
}

export async function GET() {
  return bulletinResponse();
}

/** POST returns same as GET (read-only). Stops 405 when client sends POST. */
export async function POST() {
  return bulletinResponse();
}
