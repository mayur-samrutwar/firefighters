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
- **Run continuous agent** (ticks every ~30s): `npm run agent`
- **Run a single tick** (useful for testing): `npm run agent:once`
- **Agent against port 3001**: `npm run agent:3001`

## Run Locally

```bash
npm install
npm run dev
```

Then open [`https://firefighters-six.vercel.app`](https://firefighters-six.vercel.app).

**To see fires**, run the agent in a separate terminal:

```bash
# Make sure TICK_API_SECRET is set in your environment
export TICK_API_SECRET=your-secret-token-here

npm run agent              # if app is on port 3000
npm run agent:3001         # if app is on port 3001
```

The agent POSTs to `/api/tick` every ~30s. For debugging, open [`https://firefighters-six.vercel.app/api/debug`](https://firefighters-six.vercel.app/api/debug) to verify that the server has active fires and agent state.

**Note:** The `/api/tick` endpoint requires authentication via `Authorization: Bearer <TICK_API_SECRET>` header. Make sure to set `TICK_API_SECRET` in your environment variables (`.env.local` for local development, or in your deployment platform's environment settings).

## Deploy

This is a standard Next.js app and can be deployed to Vercel, Netlify, or any Next.js-compatible host. Make sure your deployment keeps the Node server running so the `/api/tick` and `/api/debug` routes remain available.

### Supabase Cron Job (Recommended for Production)

Instead of running the external `agent-tick.mjs` script, you can use Supabase's `pg_cron` extension to automatically call `/api/tick` every 10 seconds.

**Setup:**

1. **Enable extensions** (already done if you ran `schema-cron.sql`):
   - Go to Supabase Dashboard → Database → Extensions
   - Enable `pg_cron` and `pg_net`

2. **Generate a secure secret token**:
   ```bash
   openssl rand -hex 32
   ```
   Save this token - you'll need it for both your environment variables and the database.

3. **Set the secret in your environment** (`.env.local`):
   ```bash
   TICK_API_SECRET=your-generated-secret-here
   ```
   Make sure to also set this in your deployment platform (Vercel, etc.) as an environment variable.

4. **Run the cron schema**:
   ```bash
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f supabase/schema-cron.sql
   ```

5. **Set your production API URL and secret**:
   ```bash
   # Set API URL
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -c "SELECT set_tick_api_url('https://your-app.vercel.app');"
   
   # Set API secret (use the same secret from step 2)
   PGPASSWORD="your-db-password" psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -c "SELECT set_tick_api_secret('your-generated-secret-here');"
   ```

**Security Note:** The `/api/tick` endpoint is now protected by a secret token. Only requests with the correct `Authorization: Bearer <secret>` header will be accepted. This prevents unauthorized users from manually triggering ticks.

**Manage cron jobs:**

```bash
# Check status
node scripts/manage-supabase-cron.mjs status

# Enable/disable
node scripts/manage-supabase-cron.mjs enable
node scripts/manage-supabase-cron.mjs disable

# Update API URL
node scripts/manage-supabase-cron.mjs set-url https://new-url.com
```

The cron jobs run every 10 seconds automatically, so you don't need to keep the `agent-tick.mjs` script running.

## Folder Overview

- `src/app` – Next.js app routes, API routes, and main game entry
- `src/components` – Reusable UI and visualization components (including the globe viewer and agent panels)
- `public` – Static assets such as agent icons and globe data files

Each part of the simulation is kept modular so you can extend it with new agent roles, mechanics, or visualizations without rewriting core systems.
