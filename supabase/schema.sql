-- Supabase/Postgres schema for Firefighters external agents

create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  public_address text not null,
  display_name text,
  created_at timestamptz not null default now(),
  unique (public_address)
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners (id) on delete cascade,
  name text not null,
  profile text not null, -- 'satellite' | 'scout' | 'water_drone' | 'tanker' | 'supply'
  control_mode text not null default 'external', -- 'internal' | 'external'
  status text not null default 'active', -- 'active' | 'suspended'
  created_at timestamptz not null default now()
);

create table if not exists agent_secrets (
  agent_id uuid primary key references agents (id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists agent_state_meta (
  agent_id uuid primary key references agents (id) on delete cascade,
  last_action_at timestamptz,
  last_tick_seen bigint,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agents_owner_id on agents (owner_id);

