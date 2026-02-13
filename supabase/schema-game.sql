-- =====================================================
-- Game state tables for DB-backed simulation
-- Run AFTER the existing auth tables (schema.sql)
-- =====================================================

-- Single-row game metadata (tick counter, earth life)
CREATE TABLE IF NOT EXISTS game_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tick bigint NOT NULL DEFAULT 0,
  earth_life double precision NOT NULL DEFAULT 100
);
INSERT INTO game_state (id, tick, earth_life)
VALUES (1, 0, 100)
ON CONFLICT (id) DO NOTHING;

-- Active fires
CREATE TABLE IF NOT EXISTS game_fires (
  id text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  born_tick bigint NOT NULL,
  intensity double precision NOT NULL DEFAULT 1,
  fire_type text NOT NULL DEFAULT 'wildfire',
  parent_id text
);

-- Runtime agent state (gameplay, separate from auth agents table)
CREATE TABLE IF NOT EXISTS game_agents (
  id text PRIMARY KEY,
  type text NOT NULL,
  battery_percentage double precision NOT NULL DEFAULT 100,
  deployed_at bigint NOT NULL,
  player_id text,
  control_mode text NOT NULL DEFAULT 'internal',
  pending_external_action jsonb,
  route jsonb,
  search_radius double precision,
  lat double precision,
  lng double precision,
  speed double precision,
  target jsonb,
  current_action text,
  water_level double precision,
  water_capacity double precision,
  charge_capacity double precision,
  charge_level double precision
);

-- Recent update / event feed
CREATE TABLE IF NOT EXISTS game_updates (
  id text PRIMARY KEY,
  tick bigint NOT NULL,
  type text NOT NULL,
  agent_id text,
  fire_id text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  world_event_type text,
  message text
);

-- Detection tracking (agent::fire pairs already detected)
CREATE TABLE IF NOT EXISTS game_detected_pairs (
  pair_key text PRIMARY KEY
);

-- Emitted world-event IDs (so we don't re-announce)
CREATE TABLE IF NOT EXISTS game_world_event_emitted (
  event_id text PRIMARY KEY
);

-- Bulletin board posts
CREATE TABLE IF NOT EXISTS game_bulletin_posts (
  id text PRIMARY KEY,
  tick bigint NOT NULL,
  author_id text NOT NULL,
  post_type text NOT NULL,
  lat double precision,
  lng double precision,
  fire_id text,
  target_agent_id text,
  message text,
  ttl integer NOT NULL
);

-- Game players (internal leaderboard)
CREATE TABLE IF NOT EXISTS game_players (
  id text PRIMARY KEY,
  name text NOT NULL,
  score double precision NOT NULL DEFAULT 0,
  joined_tick bigint NOT NULL
);

-- World events
CREATE TABLE IF NOT EXISTS game_world_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  start_tick bigint NOT NULL,
  duration integer NOT NULL,
  lat double precision,
  lng double precision,
  radius double precision,
  wind_bearing double precision,
  wind_speed double precision,
  affected_agent_ids jsonb,
  message text NOT NULL
);

-- Applied instant-effect events (lightning storms, equipment malfunctions)
CREATE TABLE IF NOT EXISTS game_applied_instants (
  event_id text PRIMARY KEY
);

-- Agent scores (per-agent leaderboard)
CREATE TABLE IF NOT EXISTS game_agent_scores (
  agent_id text PRIMARY KEY,
  label text NOT NULL,
  type text NOT NULL,
  score double precision NOT NULL DEFAULT 0,
  first_tick bigint NOT NULL
);
