# Firefighters

A simulation where a swarm of AI agents coordinate to detect and fight wildfires across the globe. Deploy your own agents and watch them work together in real time on an interactive 3D globe.

## What We're Building

A global firefighting simulation demonstrating AI agent coordination. Fires ignite at random locations; agents with different roles scan, verify, and extinguish them—all while managing real-world constraints like battery life and water capacity.

### Agent Types

| Role | Function |
|------|----------|
| **Satellite** | Orbits and scans the globe for fires, broadcasts coordinates when detected |
| **Drone** | Flies to reported locations, captures photos, verifies fires vs. false positives |
| **Drone + Water** | Carries water from nearby ponds and extinguishes confirmed fires |
| **Decision Maker** | Orchestrates the swarm and coordinates responses |

### How It Works

1. **Ignition** — In-game agents spawn fires at random locations around the world.
2. **Detection** — Satellite agents continuously scan the globe and broadcast fire coordinates when detected.
3. **Verification** — Nearby drone agents fly to the location, take photos, and confirm whether it’s a real fire or a false positive.
4. **Response** — Once confidence is high, water-carrying drones travel to nearby water sources, refill, and fight the fire.

### Constraints

Agents operate under realistic limits that shape strategy and coordination:

- **Battery** — Each agent can travel a maximum distance before it must return to its station or risk failing mid-flight.
- **Water capacity** — Water drones can carry only a limited amount of water per trip.
- **Safe return** — Agents must reach a station before running out; otherwise they are lost.

These constraints make coordination essential—no single agent can handle everything alone.

## Tech Stack

- **Framework** – Next.js 16 (App Router)
- **Language** – TypeScript + React 19
- **Rendering** – `three` + `react-globe.gl` for the 3D globe visualization
- **Styling** – Tailwind CSS 4

## Scripts

All commands are run from the project root:

- **Development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Start production server**: `npm run start`
- **Public agent tests**: `npm run test:public-agents`, `npm run test:public-agents-perception`, `npm run test:public-agents-act`, etc.

## Run Locally

```bash
npm install
npm run dev
```

Then open your app URL (e.g. [http://localhost:3000](http://localhost:3000)).

The **world tick** (fires spawning, fire growth, earth life decay, agent movement) runs inside Supabase. Apply the migrations in `supabase/migrations/` and ensure `pg_cron` is enabled; the scheduled job runs `run_ticks()` every minute. No separate script or HTTP tick API is needed.

For debugging, open `/api/debug` (if available) to verify fires and agent state.

## Deploy

This is a standard Next.js app and can be deployed to Vercel, Netlify, or any Next.js-compatible host.

### World tick (Supabase cron)

The game advances via **Supabase `pg_cron`**: every minute it runs `SELECT public.run_ticks();`, which runs `game_tick()` (fires, events, earth life decay) and `agent_movement_tick()` (agent movement). There is no HTTP tick endpoint; the tick is entirely in the database.

**Setup:**

1. **Enable extensions** (Supabase Dashboard → Database → Extensions): enable `pg_cron`.
2. **Run migrations** in order so that `game_tick`, `agent_movement_tick`, and `run_ticks` exist, and the cron job is scheduled:
   ```bash
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f supabase/migrations/20250214_tick_cron.sql
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f supabase/migrations/20250214_tick_agent_movement.sql
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f supabase/migrations/20250215_agent_movement_shortest_path.sql
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f supabase/migrations/20250215_run_ticks_include_movement.sql
   ```
   (Or run your full migration stack so these are applied.)

The scheduled job name is `game_tick_every_minute`; it runs every minute. No API URL or tick secret is required for the world tick.

## Folder Overview

- `src/app` – Next.js app routes, API routes, and main game entry
- `src/components` – Reusable UI and visualization components (including the globe viewer and agent panels)
- `public` – Static assets such as agent icons and globe data files

Each part of the simulation is kept modular so you can extend it with new agent roles, mechanics, or visualizations without rewriting core systems.
