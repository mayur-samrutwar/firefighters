/**
 * Database access layer for game state.
 * All game state is stored in Supabase PostgreSQL.
 */

import { supabaseServer, isSupabaseConfigured } from './supabaseServer';
import type {
  Fire,
  Agent,
  UpdateEvent,
  BulletinPost,
  Player,
  WorldEvent,
  AgentScoreEntry,
} from '@/app/game/types';

/* ─── TickContext ─────────────────────────────────────────── */

export type TickContext = {
  tick: number;
  earthLife: number;
  fires: Fire[];
  agents: Agent[];
  updates: UpdateEvent[];
  detectedPairs: Set<string>;
  worldEventEmitted: Set<string>;
  bulletinPosts: BulletinPost[];
  players: Player[];
  worldEvents: WorldEvent[];
  appliedInstants: Set<string>;
  agentScores: Map<string, AgentScoreEntry>;
  /** Agent IDs present at load time — used for differential save */
  _loadedAgentIds: string[];
};

/* ─── Helpers ────────────────────────────────────────────── */

function getClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Game state requires a database. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return supabaseServer.client;
}

/* ─── Row ↔ Object mappers ───────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Fire
function fireToRow(f: Fire): Row {
  return {
    id: f.id,
    lat: f.lat,
    lng: f.lng,
    born_tick: f.bornTick,
    intensity: f.intensity,
    fire_type: f.fireType,
    parent_id: f.parentId ?? null,
  };
}
function rowToFire(r: Row): Fire {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    bornTick: r.born_tick,
    intensity: r.intensity,
    fireType: r.fire_type,
    parentId: r.parent_id ?? undefined,
  };
}

// Agent
function agentToRow(a: Agent): Row {
  return {
    id: a.id,
    type: a.type,
    display_name: a.displayName ?? null,
    battery_percentage: a.batteryPercentage,
    deployed_at: a.deployedAt,
    player_id: a.playerId ?? null,
    control_mode: a.controlMode ?? 'internal',
    pending_external_action: a.pendingExternalAction ?? null,
    route: a.route ?? null,
    search_radius: a.searchRadius ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    speed: a.speed ?? null,
    target: a.target ?? null,
    current_action: a.currentAction ?? null,
    water_level: a.waterLevel ?? null,
    water_capacity: a.waterCapacity ?? null,
    charge_capacity: a.chargeCapacity ?? null,
    charge_level: a.chargeLevel ?? null,
  };
}
function rowToAgent(r: Row): Agent {
  return {
    id: r.id,
    type: r.type,
    displayName: r.display_name ?? undefined,
    batteryPercentage: r.battery_percentage,
    // Supabase/Postgres may return bigint as string; satellite position needs a number
    deployedAt: r.deployed_at != null ? Number(r.deployed_at) : Date.now(),
    playerId: r.player_id ?? undefined,
    controlMode: r.control_mode ?? 'internal',
    pendingExternalAction: r.pending_external_action ?? null,
    route: r.route ?? undefined,
    searchRadius: r.search_radius ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    speed: r.speed ?? undefined,
    target: r.target ?? null,
    currentAction: r.current_action ?? null,
    waterLevel: r.water_level ?? undefined,
    waterCapacity: r.water_capacity ?? undefined,
    chargeCapacity: r.charge_capacity ?? undefined,
    chargeLevel: r.charge_level ?? undefined,
  };
}

// UpdateEvent
function updateToRow(e: UpdateEvent): Row {
  return {
    id: e.id,
    tick: e.tick,
    type: e.type,
    agent_id: e.agentId ?? null,
    fire_id: e.fireId ?? null,
    lat: e.lat,
    lng: e.lng,
    world_event_type: e.worldEventType ?? null,
    message: e.message ?? null,
  };
}
function rowToUpdate(r: Row): UpdateEvent {
  return {
    id: r.id,
    tick: r.tick,
    type: r.type,
    agentId: r.agent_id ?? undefined,
    fireId: r.fire_id ?? undefined,
    lat: r.lat,
    lng: r.lng,
    worldEventType: r.world_event_type ?? undefined,
    message: r.message ?? undefined,
  };
}

// BulletinPost
function bulletinToRow(p: BulletinPost): Row {
  return {
    id: p.id,
    tick: p.tick,
    author_id: p.authorId,
    post_type: p.postType,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    fire_id: p.fireId ?? null,
    target_agent_id: p.targetAgentId ?? null,
    message: p.message ?? null,
    ttl: p.ttl,
  };
}
function rowToBulletin(r: Row): BulletinPost {
  return {
    id: r.id,
    tick: r.tick,
    authorId: r.author_id,
    postType: r.post_type,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    fireId: r.fire_id ?? undefined,
    targetAgentId: r.target_agent_id ?? undefined,
    message: r.message ?? undefined,
    ttl: r.ttl,
  };
}

// Player
function playerToRow(p: Player): Row {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    joined_tick: p.joinedTick,
  };
}
function rowToPlayer(r: Row): Player {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    joinedTick: r.joined_tick,
  };
}

// WorldEvent
function worldEventToRow(e: WorldEvent): Row {
  return {
    id: e.id,
    type: e.type,
    start_tick: e.startTick,
    duration: e.duration,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    radius: e.radius ?? null,
    wind_bearing: e.windBearing ?? null,
    wind_speed: e.windSpeed ?? null,
    affected_agent_ids: e.affectedAgentIds ?? null,
    message: e.message,
  };
}
function rowToWorldEvent(r: Row): WorldEvent {
  return {
    id: r.id,
    type: r.type,
    startTick: r.start_tick,
    duration: r.duration,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    radius: r.radius ?? undefined,
    windBearing: r.wind_bearing ?? undefined,
    windSpeed: r.wind_speed ?? undefined,
    affectedAgentIds: r.affected_agent_ids ?? undefined,
    message: r.message,
  };
}

// AgentScoreEntry
function agentScoreToRow(e: AgentScoreEntry): Row {
  return {
    agent_id: e.agentId,
    label: e.label,
    type: e.type,
    score: e.score,
    first_tick: e.firstTick,
  };
}
function rowToAgentScore(r: Row): AgentScoreEntry {
  return {
    agentId: r.agent_id,
    label: r.label,
    type: r.type,
    score: r.score,
    firstTick: r.first_tick,
  };
}

/* ═══════════════════════════════════════════════════════════
   Load / Save — used by processTick
   ═══════════════════════════════════════════════════════════ */

export async function loadTickContext(): Promise<TickContext> {
  const sb = getClient();

  const [
    stateRes,
    firesRes,
    agentsRes,
    updatesRes,
    pairsRes,
    emittedRes,
    bulletinRes,
    playersRes,
    worldEventsRes,
    instantsRes,
    scoresRes,
  ] = await Promise.all([
    sb.from('game_state').select('*').eq('id', 1).maybeSingle(),
    sb.from('game_fires').select('*'),
    sb.from('game_agents').select('*'),
    sb.from('game_updates').select('*'),
    sb.from('game_detected_pairs').select('*'),
    sb.from('game_world_event_emitted').select('*'),
    sb.from('game_bulletin_posts').select('*'),
    sb.from('game_players').select('*'),
    sb.from('game_world_events').select('*'),
    sb.from('game_applied_instants').select('*'),
    sb.from('game_agent_scores').select('*'),
  ]);

  const gs = stateRes.data ?? { tick: 0, earth_life: 100 };
  const agents = (agentsRes.data ?? []).map(rowToAgent);

  return {
    tick: gs.tick ?? 0,
    earthLife: gs.earth_life ?? 100,
    fires: (firesRes.data ?? []).map(rowToFire),
    agents,
    updates: (updatesRes.data ?? []).map(rowToUpdate),
    detectedPairs: new Set(
      (pairsRes.data ?? []).map((r: Row) => r.pair_key as string)
    ),
    worldEventEmitted: new Set(
      (emittedRes.data ?? []).map((r: Row) => r.event_id as string)
    ),
    bulletinPosts: (bulletinRes.data ?? []).map(rowToBulletin),
    players: (playersRes.data ?? []).map(rowToPlayer),
    worldEvents: (worldEventsRes.data ?? []).map(rowToWorldEvent),
    appliedInstants: new Set(
      (instantsRes.data ?? []).map((r: Row) => r.event_id as string)
    ),
    agentScores: new Map(
      (scoresRes.data ?? [])
        .map(rowToAgentScore)
        .map((e) => [e.agentId, e] as const)
    ),
    _loadedAgentIds: agents.map((a) => a.id),
  };
}

/** Helper: delete all rows from a table (PK column must be NOT NULL). */
async function clearTable(table: string, pkField: string = 'id') {
  const sb = getClient();
  await sb.from(table).delete().not(pkField, 'is', null);
}

/** Helper: replace all rows (delete all then insert). */
async function replaceAll(
  table: string,
  rows: Row[],
  pkField: string = 'id'
) {
  await clearTable(table, pkField);
  if (rows.length === 0) return;
  const sb = getClient();
  for (let i = 0; i < rows.length; i += 500) {
    await sb.from(table).insert(rows.slice(i, i + 500));
  }
}

export async function saveTickContext(ctx: TickContext): Promise<void> {
  const sb = getClient();

  // Agents that died during tick (loaded but no longer in context)
  const currentAgentIds = new Set(ctx.agents.map((a) => a.id));
  const deadAgentIds = ctx._loadedAgentIds.filter(
    (id) => !currentAgentIds.has(id)
  );

  await Promise.all([
    // 1. Game state meta
    sb.from('game_state').upsert({
      id: 1,
      tick: ctx.tick,
      earth_life: ctx.earthLife,
    }),

    // 2. Fires (tick-only writes, safe to replace)
    replaceAll('game_fires', ctx.fires.map(fireToRow)),

    // 3. Agents — differential: delete dead internal agents, upsert alive
    // Note: External agents are kept in ctx.agents even when dead (battery = 0)
    // so they persist in the database and can be recharged/respawned
    (async () => {
      if (deadAgentIds.length > 0) {
        await sb.from('game_agents').delete().in('id', deadAgentIds);
      }
      if (ctx.agents.length > 0) {
        await sb.from('game_agents').upsert(ctx.agents.map(agentToRow));
      }
    })(),

    // 4. Updates (tick-only)
    replaceAll('game_updates', ctx.updates.map(updateToRow)),

    // 5. Detected pairs (tick-only)
    replaceAll(
      'game_detected_pairs',
      Array.from(ctx.detectedPairs).map((k) => ({ pair_key: k })),
      'pair_key'
    ),

    // 6. World event emitted (tick-only)
    replaceAll(
      'game_world_event_emitted',
      Array.from(ctx.worldEventEmitted).map((id) => ({ event_id: id })),
      'event_id'
    ),

    // 7. Bulletin posts (tick-only)
    replaceAll('game_bulletin_posts', ctx.bulletinPosts.map(bulletinToRow)),

    // 8. Players — upsert (concurrent register possible)
    ctx.players.length > 0
      ? sb.from('game_players').upsert(ctx.players.map(playerToRow))
      : Promise.resolve(),

    // 9. World events (tick-only)
    replaceAll('game_world_events', ctx.worldEvents.map(worldEventToRow)),

    // 10. Applied instants (tick-only)
    replaceAll(
      'game_applied_instants',
      Array.from(ctx.appliedInstants).map((id) => ({ event_id: id })),
      'event_id'
    ),

    // 11. Agent scores — upsert
    ctx.agentScores.size > 0
      ? sb
          .from('game_agent_scores')
          .upsert(
            Array.from(ctx.agentScores.values()).map(agentScoreToRow)
          )
      : Promise.resolve(),
  ]);
}

/* ═══════════════════════════════════════════════════════════
   Individual DB operations — used by API routes
   ═══════════════════════════════════════════════════════════ */

export async function dbGetTick(): Promise<number> {
  const sb = getClient();
  const { data } = await sb
    .from('game_state')
    .select('tick')
    .eq('id', 1)
    .maybeSingle();
  return data?.tick ?? 0;
}

export async function dbGetEarthLife(): Promise<number> {
  const sb = getClient();
  const { data } = await sb
    .from('game_state')
    .select('earth_life')
    .eq('id', 1)
    .maybeSingle();
  return data?.earth_life ?? 100;
}

export async function dbGetFires(): Promise<Fire[]> {
  const sb = getClient();
  const { data } = await sb.from('game_fires').select('*');
  return (data ?? []).map(rowToFire);
}

export async function dbGetAgents(): Promise<Agent[]> {
  const sb = getClient();
  const { data } = await sb.from('game_agents').select('*');
  return (data ?? []).map(rowToAgent);
}

export async function dbGetAgentById(
  id: string
): Promise<Agent | undefined> {
  const sb = getClient();
  const { data } = await sb
    .from('game_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data ? rowToAgent(data) : undefined;
}

export async function dbGetUpdates(): Promise<UpdateEvent[]> {
  const sb = getClient();
  const { data } = await sb.from('game_updates').select('*');
  return (data ?? []).map(rowToUpdate);
}

export async function dbGetBulletinPosts(): Promise<BulletinPost[]> {
  const sb = getClient();
  const { data } = await sb
    .from('game_bulletin_posts')
    .select('*')
    .gt('ttl', 0);
  return (data ?? []).map(rowToBulletin);
}

export async function dbGetPlayers(): Promise<Player[]> {
  const sb = getClient();
  const { data } = await sb.from('game_players').select('*');
  return (data ?? []).map(rowToPlayer);
}

export async function dbPlayerExists(id: string): Promise<boolean> {
  const sb = getClient();
  const { data } = await sb
    .from('game_players')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  return !!data;
}

export async function dbGetWorldEvents(): Promise<WorldEvent[]> {
  const sb = getClient();
  const { data } = await sb.from('game_world_events').select('*');
  return (data ?? []).map(rowToWorldEvent);
}

export async function dbGetActiveWorldEvents(): Promise<WorldEvent[]> {
  const tick = await dbGetTick();
  const events = await dbGetWorldEvents();
  return events.filter(
    (e) => tick >= e.startTick && tick < e.startTick + e.duration
  );
}

export async function dbGetAgentScores(): Promise<AgentScoreEntry[]> {
  const sb = getClient();
  const { data } = await sb.from('game_agent_scores').select('*');
  return (data ?? []).map(rowToAgentScore);
}

/* ─── Mutations (API routes) ─────────────────────────────── */

export async function dbDeployAgent(agent: Agent): Promise<void> {
  const sb = getClient();
  await sb.from('game_agents').insert(agentToRow(agent));
}

export async function dbUpsertAgent(agent: Agent): Promise<void> {
  const sb = getClient();
  await sb.from('game_agents').upsert(agentToRow(agent));
}

export async function dbRegisterPlayer(player: Player): Promise<void> {
  const sb = getClient();
  await sb.from('game_players').insert(playerToRow(player));
}

export async function dbInsertWorldEvent(
  event: WorldEvent
): Promise<void> {
  const sb = getClient();
  await sb.from('game_world_events').insert(worldEventToRow(event));
}

export async function dbCountAgentsByType(
  type: string
): Promise<number> {
  const sb = getClient();
  const { count } = await sb
    .from('game_agents')
    .select('id', { count: 'exact', head: true })
    .eq('type', type);
  return count ?? 0;
}

export async function dbResetAll(): Promise<void> {
  const sb = getClient();
  await Promise.all([
    sb.from('game_fires').delete().not('id', 'is', null),
    sb.from('game_agents').delete().not('id', 'is', null),
    sb.from('game_updates').delete().not('id', 'is', null),
    sb.from('game_detected_pairs').delete().not('pair_key', 'is', null),
    sb
      .from('game_world_event_emitted')
      .delete()
      .not('event_id', 'is', null),
    sb.from('game_bulletin_posts').delete().not('id', 'is', null),
    sb.from('game_players').delete().not('id', 'is', null),
    sb.from('game_world_events').delete().not('id', 'is', null),
    sb
      .from('game_applied_instants')
      .delete()
      .not('event_id', 'is', null),
    sb
      .from('game_agent_scores')
      .delete()
      .not('agent_id', 'is', null),
  ]);
  await sb
    .from('game_state')
    .upsert({ id: 1, tick: 0, earth_life: 100 });
}
