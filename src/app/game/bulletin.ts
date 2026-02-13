/**
 * Bulletin Board — shared message board for agent coordination.
 *
 * Provides both:
 *  - Pure context-based functions (for tick)
 *  - Async DB-backed functions (for API routes)
 */

import type { BulletinPost, BulletinPostType } from './types';
import { dbGetBulletinPosts } from '@/lib/gameDb';

export type { BulletinPost, BulletinPostType } from './types';

/* ─── Constants ─────────────────────────────────────────── */

const MAX_POSTS = 100;
const DEFAULT_TTL = 10;

/* ═══════════════════════════════════════════════════════════
   Pure context-based functions (for tick)
   ═══════════════════════════════════════════════════════════ */

/** Get active posts from a list */
export function getBulletinPostsFromList(
  posts: BulletinPost[]
): BulletinPost[] {
  return posts.filter((p) => p.ttl > 0);
}

/** Get posts assigned to a specific agent */
export function getAssignmentsForAgentFromList(
  posts: BulletinPost[],
  agentId: string
): BulletinPost[] {
  return posts.filter(
    (p) =>
      p.postType === 'task_assign' &&
      p.targetAgentId === agentId &&
      p.ttl > 0
  );
}

/** Check if a fire already has a fire_report */
export function hasFireReportFromList(
  posts: BulletinPost[],
  fireId: string
): boolean {
  return posts.some(
    (p) =>
      p.postType === 'fire_report' && p.fireId === fireId && p.ttl > 0
  );
}

/** Check if an agent is heading to a fire */
export function hasHeadingToFromList(
  posts: BulletinPost[],
  fireId: string
): boolean {
  return posts.some(
    (p) =>
      p.postType === 'heading_to' && p.fireId === fireId && p.ttl > 0
  );
}

/** Count how many agents are heading to a specific fire */
export function countHeadingToFromList(
  posts: BulletinPost[],
  fireId: string
): number {
  return posts.filter(
    (p) =>
      p.postType === 'heading_to' && p.fireId === fireId && p.ttl > 0
  ).length;
}

/** Post a new bulletin to the context list */
export function postBulletinCtx(
  posts: BulletinPost[],
  tick: number,
  params: Omit<BulletinPost, 'id' | 'tick' | 'ttl'> & { ttl?: number }
): BulletinPost {
  const post: BulletinPost = {
    id: `blt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tick,
    ttl: params.ttl ?? DEFAULT_TTL,
    ...params,
  };
  posts.push(post);
  if (posts.length > MAX_POSTS) {
    posts.splice(0, posts.length - MAX_POSTS);
  }
  return post;
}

/** Decrement TTL and remove expired posts */
export function pruneBulletinCtx(posts: BulletinPost[]): void {
  for (const post of posts) {
    post.ttl -= 1;
  }
  const alive = posts.filter((p) => p.ttl > 0);
  posts.length = 0;
  posts.push(...alive);
}

/* ═══════════════════════════════════════════════════════════
   Async DB-backed functions (for API routes)
   ═══════════════════════════════════════════════════════════ */

export async function getBulletinPosts(): Promise<BulletinPost[]> {
  return dbGetBulletinPosts();
}

export async function _resetBulletin(): Promise<void> {
  // Handled by dbResetAll in gameDb.ts
}
