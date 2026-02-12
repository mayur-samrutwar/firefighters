/**
 * Bulletin Board — shared message board for agent coordination.
 *
 * Agents post messages (fire reports, heading notifications, requests)
 * and other agents read them to make decisions. Posts have a TTL and
 * are pruned automatically each tick.
 *
 * State lives on globalThis alongside the rest of the game state.
 */

/* ─── Types ─────────────────────────────────────────────── */

export type BulletinPostType =
  | 'fire_report'   // "I detected fire X at [lat, lng]"
  | 'heading_to'    // "I'm heading to fire X"
  | 'need_water'    // "I need water refill"
  | 'need_charge'   // "I need battery recharge"
  | 'task_assign'   // Coordinator assigns task to agent
  | 'all_clear';    // "Fire X is extinguished"

export type BulletinPost = {
  id: string;
  tick: number;         // tick when posted
  authorId: string;     // agent that posted
  postType: BulletinPostType;
  lat?: number;
  lng?: number;
  fireId?: string;
  targetAgentId?: string; // for task_assign — who should act
  message?: string;
  ttl: number;          // remaining ticks before expiry
};

/* ─── Constants ─────────────────────────────────────────── */

const MAX_POSTS = 100;
const DEFAULT_TTL = 10; // ticks

/* ─── State (on globalThis) ─────────────────────────────── */

type BulletinState = {
  posts: BulletinPost[];
};

const g = globalThis as unknown as { __fireBulletinState?: BulletinState };
if (!g.__fireBulletinState) {
  g.__fireBulletinState = { posts: [] };
}
const bState = g.__fireBulletinState;

/* ─── Getters ───────────────────────────────────────────── */

/** Get all active (non-expired) bulletin posts */
export function getBulletinPosts(): BulletinPost[] {
  return bState.posts.filter((p) => p.ttl > 0);
}

/** Get posts assigned to a specific agent */
export function getAssignmentsForAgent(agentId: string): BulletinPost[] {
  return bState.posts.filter(
    (p) => p.postType === 'task_assign' && p.targetAgentId === agentId && p.ttl > 0
  );
}

/** Check if a fire already has a fire_report on the board */
export function hasFireReport(fireId: string): boolean {
  return bState.posts.some(
    (p) => p.postType === 'fire_report' && p.fireId === fireId && p.ttl > 0
  );
}

/** Check if an agent is already heading to a fire */
export function hasHeadingTo(fireId: string): boolean {
  return bState.posts.some(
    (p) => p.postType === 'heading_to' && p.fireId === fireId && p.ttl > 0
  );
}

/** Check how many agents are heading to a specific fire */
export function countHeadingTo(fireId: string): number {
  return bState.posts.filter(
    (p) => p.postType === 'heading_to' && p.fireId === fireId && p.ttl > 0
  ).length;
}

/* ─── Mutations ─────────────────────────────────────────── */

export function postBulletin(
  tick: number,
  params: Omit<BulletinPost, 'id' | 'tick' | 'ttl'> & { ttl?: number }
): BulletinPost {
  const post: BulletinPost = {
    id: `blt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tick,
    ttl: params.ttl ?? DEFAULT_TTL,
    ...params,
  };
  bState.posts.push(post);

  // Cap total posts
  if (bState.posts.length > MAX_POSTS) {
    bState.posts.splice(0, bState.posts.length - MAX_POSTS);
  }

  return post;
}

/** Decrement TTL on all posts and remove expired ones */
export function pruneBulletin() {
  for (const post of bState.posts) {
    post.ttl -= 1;
  }
  const alive = bState.posts.filter((p) => p.ttl > 0);
  bState.posts.length = 0;
  bState.posts.push(...alive);
}

/* ─── Reset (testing) ───────────────────────────────────── */

export function _resetBulletin() {
  bState.posts.length = 0;
}
