/**
 * Agent Actions — the possible things an agent can do each tick.
 *
 * Each agent picks ONE action per tick. The action is then executed
 * against the game state. Actions are validated before execution.
 */

import type { BulletinPostType } from './bulletin';
import { postBulletin } from './bulletin';
import type { Agent } from './store';
import { getTick } from './store';

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
  | { action: 'idle' };

/* ─── Execute an action ─────────────────────────────────── */

/**
 * Applies the chosen action to the agent. Movement, extinguish, and
 * refill are handled by store.ts mechanical loops — here we only
 * handle target-setting, bulletin posting, and action labeling.
 *
 * Returns the action label string for the agent's `currentAction`.
 */
export function executeAction(agent: Agent, chosen: AgentAction): string | null {
  switch (chosen.action) {
    case 'move_to': {
      agent.target = { lat: chosen.lat, lng: chosen.lng };
      return 'moving';
    }

    case 'extinguish': {
      // The actual extinguish logic runs in store's runExtinguish()
      // We just label the agent's intent
      return 'extinguishing';
    }

    case 'refill': {
      return 'refilling';
    }

    case 'recharge': {
      return 'recharging';
    }

    case 'post_bulletin': {
      postBulletin(getTick(), {
        authorId: agent.id,
        postType: chosen.postType,
        lat: chosen.lat,
        lng: chosen.lng,
        fireId: chosen.fireId,
        targetAgentId: chosen.targetAgentId,
        message: chosen.message,
      });
      return null; // posting doesn't change movement action
    }

    case 'idle': {
      return null;
    }
  }
}
