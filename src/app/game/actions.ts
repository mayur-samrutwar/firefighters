/**
 * Agent Actions — the possible things an agent can do each tick.
 *
 * executeAction now takes an ActionContext (tick + bulletinPosts array)
 * so it can post bulletins by pushing to the context list instead of
 * calling an async DB function.
 */

import type { Agent, BulletinPost, BulletinPostType } from './types';

/* ─── Action types ──────────────────────────────────────── */

export type AgentAction =
  | { action: 'move_to'; lat: number; lng: number }
  | { action: 'extinguish' }
  | { action: 'refill' }
  | { action: 'recharge'; targetAgentId: string }
  | {
      action: 'post_bulletin';
      postType: BulletinPostType;
      lat?: number;
      lng?: number;
      fireId?: string;
      targetAgentId?: string;
      message?: string;
    }
  | { action: 'change_route'; route: [number, number][] }
  | { action: 'idle' };

/* ─── Action context (subset of TickContext) ──────────────── */

export type ActionContext = {
  tick: number;
  bulletinPosts: BulletinPost[];
};

/* ─── Execute an action ─────────────────────────────────── */

const DEFAULT_TTL = 10;

export function executeAction(
  agent: Agent,
  chosen: AgentAction,
  ctx: ActionContext
): string | null {
  switch (chosen.action) {
    case 'move_to': {
      agent.target = { lat: chosen.lat, lng: chosen.lng };
      return 'moving';
    }

    case 'extinguish': {
      return 'extinguishing';
    }

    case 'refill': {
      return 'refilling';
    }

    case 'recharge': {
      return 'recharging';
    }

    case 'post_bulletin': {
      const post: BulletinPost = {
        id: `blt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tick: ctx.tick,
        ttl: DEFAULT_TTL,
        authorId: agent.id,
        postType: chosen.postType,
        lat: chosen.lat,
        lng: chosen.lng,
        fireId: chosen.fireId,
        targetAgentId: chosen.targetAgentId,
        message: chosen.message,
      };
      ctx.bulletinPosts.push(post);
      if (ctx.bulletinPosts.length > 100) {
        ctx.bulletinPosts.splice(0, ctx.bulletinPosts.length - 100);
      }
      return null;
    }

    case 'change_route': {
      if (agent.type === 'satellite' && chosen.route.length >= 2) {
        agent.route = chosen.route;
        return 'route updated';
      }
      return null;
    }

    case 'idle': {
      return null;
    }
  }
}
