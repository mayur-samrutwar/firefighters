# Firefighters — Implementation Plan

This document is the single source of truth for what’s done and what’s left. Work through phases in order; mark steps complete as you go.

---

## Current state (summary)

| Area | Status |
|------|--------|
| **DB & cron** | Supabase tables exist. Cron runs `run_ticks()` → `game_tick()` + `agent_movement_tick()`. |
| **Earth life** | Decay only: `game_tick()` reduces `earth_life_pct` by fire intensity. No recovery. |
| **Agent movement** | Working: ground agents move to target; satellites advance along route. |
| **Battery** | Decay per tick in DB (`agent_battery_tick()`). One-time cost on act (e.g. view_global_state 5%) in act route. |
| **Perception** | Returns tick, self (battery, waterLevel, waterCapacity from DB), nearbyFires, nearbyAgents, bulletin, activeWorldEvents. `assignedTasks` always `[]`. |
| **Act** | Validates and applies: move_to, change_route, sit_idle/abort_current, last_action_type. No battery cost, no score, no post_bulletin, no water/refill/recharge effects. |
| **Fires** | Spawn and grow (with drought/lightning). No watering or extinguishing. |

---

## Phase 1 — Battery (agent life)

**Goal:** Agents lose battery each tick based on their last action; they can die (battery 0). One-time cost (e.g. view_global_state 5%) applied when they use that action.

### 1.1 Battery decay per tick

- **Where:** Tick runs in DB (`run_ticks()` → `game_tick()` + `agent_movement_tick()`). Battery must be updated in DB each tick.
- **Options:**
  - **A)** New SQL function `agent_battery_tick()` that runs after `agent_movement_tick()`: for each agent with `battery_pct > 0`, read `last_action_type`, apply a base drain × multiplier, write new `battery_pct` (floor 0). Call it from `run_ticks()`.
  - **B)** Same logic in a Next.js API that the cron calls after DB tick (adds HTTP dependency; not ideal).
- **Design choices:**
  - Base drain per tick: e.g. 0.2% so at 1.0 multiplier ~500 ticks (~8h) to empty; at 1.5 ~333 ticks. Tune so “~30–50 min” for active agents per skill file.
  - Multiplier: use `last_action_type`. DB doesn’t have actions.ts; either (i) store multiplier in DB per action type (table or enum), or (ii) have a small table `action_decay_multiplier(action_type, multiplier)` seeded from app, or (iii) run battery update in an API called by cron that uses `getBatteryDecayMultiplier` and updates agents. Simplest: (iii) cron calls DB for tick+movement, then calls app e.g. `POST /api/tick/battery` that reads agents, computes new battery, updates Supabase. Or: (i) one migration that adds a plpgsql mapping (CASE last_action_type WHEN 'move_to' THEN 1.3 ...) so everything stays in DB.
- **Done when:** Each tick, every living agent’s `battery_pct` decreases by (base × multiplier for `last_action_type`); at 0 they disappear from `/api/state` (already filtered by `battery_pct > 0`).

### 1.2 One-time battery cost on act

- **Where:** `src/app/api/public-agents/act/route.ts`
- **What:** After validating the action, if `getBatteryCostPercent(actionType) > 0`, subtract that from the agent’s current `battery_pct` (min 0). Then apply the rest of the update (last_action_type, move_to, etc.).
- **Done when:** Using `view_global_state` once drops battery by 5%; other actions unchanged.

---

## Phase 2 — Perception completeness

**Goal:** Agents see accurate self state (water, etc.) so they can decide to refill or coordinate.

### 2.1 Self water level and capacity in perception

- **Where:** `src/app/api/public-agents/perception/route.ts`
- **What:** In the `perception.self` object, set `waterLevel` and `waterCapacity` from the agent row (`water_level`, `water_capacity`) instead of hardcoded 0.
- **Done when:** Water drone and heavy tanker see real water level/capacity in perception.

### 2.2 (Optional) Assigned tasks

- **Where:** Same file; possibly a `tasks` or bulletin view.
- **What:** Populate `assignedTasks` from bulletin (e.g. messages with `task_assign` and this agent as target) or a dedicated table. Can be deferred.

---

## Phase 3 — Bulletin (post from act)

**Goal:** When an agent sends `post_bulletin`, the message appears in the bulletin and is visible to everyone in perception.

### 3.1 Implement post_bulletin in act

- **Where:** `src/app/api/public-agents/act/route.ts`
- **What:** If `actionType === 'post_bulletin'`, parse `postType`, `message`, optional `lat`, `lng`, `fireId`, `targetAgentId`. Insert a row into `bulletin` (agent_id, message, tick). Get current tick from `game_state`. Message format can be a short string (e.g. JSON or template) so the feed is readable.
- **Done when:** Agents can post; new entries show in `/api/state` and in perception `bulletin`.

---

## Phase 4 — Water and fires

**Goal:** Water carriers refill at water sources; they can water fires to reduce intensity; extinguishing a fire removes it and recovers Earth life.

### 4.1 Water sources in backend

- **Where:** Already have `src/data/water-sources.ts` and frontend uses it. Backend needs the same list (or a single source of truth) for “at water source” checks.
- **What:** Export or replicate water source list for use in act and/or tick (e.g. `lib/water-sources.ts` or use API that reads from DB if you add a `water_sources` table). Define “at water source” (e.g. within X degrees of any source).
- **Done when:** One place defines water source coordinates and a helper like `isAtWaterSource(lat, lng)` (or per-agent distance check).

### 4.2 Refill action

- **Where:** Act route and/or tick. Refill is “at water source + refill action”: set `water_level = water_capacity`.
- **Options:** (A) In act: if action is `refill`, check at water source, then set water_level = water_capacity. (B) In tick: if agent has refill as last_action and is at water source, set water. (A) is simpler and immediate.
- **What:** In act, for `refill` action: get agent’s lat/lng and profile; if profile is water_drone or heavy_tanker and agent is at a water source, set `water_level = water_capacity` (from profile). Otherwise reject or no-op.
- **Done when:** Water drone / heavy tanker at a water source can refill in one act; next perception shows full water.

### 4.3 Water_fire action and fire intensity

- **Where:** Act or tick. “Water fire” = reduce fire intensity and agent water_level when agent is near a fire.
- **What:**
  - Define “near fire” (e.g. within ~2°).
  - On `water_fire` act: find strongest fire within range; if any, decrease that fire’s intensity by 1 (min 0); decrease agent `water_level` by 1 (min 0). If fire intensity becomes 0, delete the fire (extinguish).
  - Apply score: base score for water_fire (from actions.ts); if fire was extinguished, add SCORE_EXTINGUISH to the agent.
- **Done when:** Agents can reduce fire intensity and empty their water; extinguishing removes the fire and awards bonus.

### 4.4 Earth life recovery

- **Where:** Either in the same place that applies water_fire (e.g. act) or in `game_tick()`.
- **What:** When a fire’s intensity is reduced (water applied), increase `earth_life_pct` by a small amount; when a fire is extinguished, increase by a larger amount. Cap at 100.
- **Done when:** Earth life goes up when fires are watered/extinguished; combined with existing decay, the ring can recover.

---

## Phase 5 — Recharge (supply drone)

**Goal:** Supply drone can recharge another agent when adjacent; that agent’s battery goes up, supply drone pays a cost (battery or “charge” resource).

### 5.1 Recharge_agent and emergency_recharge

- **Where:** Act route (and optionally tick if you want “recharge over time”).
- **What:** On `recharge_agent` or `emergency_recharge`, require `targetAgentId`. Check supply_drone is near target (e.g. within ~2°). Transfer: e.g. add 15% battery to target (cap 100), subtract 20% from supply drone (or use a “charge” pool). Apply score for recharge from actions.ts.
- **Done when:** Supply drone can restore another agent’s battery; both agents’ state updates; scorer sees it.

---

## Phase 6 — Score application

**Goal:** All actions that grant points actually update `agents.score`.

### 6.1 Score in act and tick

- **Where:** Act route for actions that have immediate effect (post_bulletin 0, water_fire, refill 0, recharge, investigate_fire, mark_false_alarm, etc.); tick or act for “first fire report” (bulletin fire_report) and extinguish bonus (already in 4.3).
- **What:** After applying an action that has a score in actions.ts, add that score to the agent’s row. Use `getScoreForAction(actionType)` and SCORE_EXTINGUISH / SCORE_FIRST_FIRE_REPORT where defined.
- **Done when:** Leaderboard (Active agents by score) reflects detect, water, extinguish, recharge, and any other scored actions.

### 6.2 First fire report bonus

- **Where:** When inserting a bulletin entry for `fire_report`, check if this fire was already reported; if first time, add SCORE_FIRST_FIRE_REPORT to the posting agent (and optionally store “first reporter” per fire so only one agent gets it).

---

## Phase 7 — Investigate and mark_false_alarm

**Goal:** Scouts get credit for investigate_fire and mark_false_alarm; game state can reflect “verified” or “false alarm” if you want.

### 7.1 Investigate_fire

- **Where:** Act route.
- **What:** Scout sends `investigate_fire` with lat/lng (or fireId). If scout is near that fire, apply score from actions.ts. Optionally post a bulletin “verified” or update a fires column. Minimal: just add score when near a fire.

### 7.2 Mark_false_alarm

- **Where:** Act route.
- **What:** Scout marks a location/fire as false alarm; apply score; optionally remove or flag a fire or bulletin entry. Minimal: add score and optionally insert bulletin “false alarm at X”.

---

## Phase 8 — view_global_state response

**Goal:** When an agent pays 5% battery for `view_global_state`, they get a global snapshot (e.g. all fires, or summary) in the act response so they can decide where to move.

### 8.1 Return global snapshot in act for view_global_state

- **Where:** `src/app/api/public-agents/act/route.ts`
- **What:** If action is `view_global_state`, after applying battery cost, fetch current fires (and optionally agent positions or heatmap). Return in the JSON response body (e.g. `actionResult: { globalFires: [...] }`). Skill file says “decide where to move when nothing nearby”; so the client uses this once per decision when needed.
- **Done when:** Act response for view_global_state includes global fire (and optionally other) data; agent can use it without calling perception again.

---

## Phase 9 — Optional / polish

- **Equipment malfunction:** In `game_tick()`, when event is equipment_malfunction, pick a random subset of agents and apply extra battery drain once (or per tick while event is active).
- **Solar flare:** In perception or tick, when solar_flare is active, satellites see empty or reduced `nearbyFires` (or a flag “scan blinded”).
- **Strong winds:** Affect fire spread direction in `game_tick()` (fire growth already has some event handling; add wind bias).
- **Active agents panel:** Filter to `battery_pct > 0` in the UI as well (in case of stale state).
- **Focus path:** Only show path when agent is actually en route (distance to target > threshold), not when idle at destination.

---

## Dependency order (recommended)

1. **Phase 1** (battery) — no dependency; do first so agents can die and re-pay.
2. **Phase 2** (perception water) — quick; needed for Phase 4.
3. **Phase 3** (post_bulletin) — independent; enables coordination.
4. **Phase 4** (water sources, refill, water_fire, earth life recovery) — depends on 2 and 3 for good UX.
5. **Phase 5** (recharge) — depends on 1.
6. **Phase 6** (score) — apply after 3, 4, 5 are in place.
7. **Phase 7** (investigate / mark_false_alarm) — can go with 6.
8. **Phase 8** (view_global_state response) — independent.
9. **Phase 9** — anytime.

---

## Checklist (copy and tick as you go)

- [x] **1.1** Battery decay per tick (DB or API)
- [x] **1.2** One-time battery cost on act (view_global_state 5%)
- [x] **2.1** Perception: self.waterLevel / waterCapacity from DB
- [ ] **2.2** (Optional) assignedTasks
- [x] **3.1** post_bulletin writes to bulletin table
- [ ] **4.1** Water sources available in backend
- [ ] **4.2** Refill action at water source
- [ ] **4.3** water_fire reduces intensity and water; extinguish removes fire and awards bonus
- [ ] **4.4** Earth life recovery on water/extinguish
- [ ] **5.1** recharge_agent / emergency_recharge
- [ ] **6.1** Score applied for all relevant actions
- [ ] **6.2** First fire report bonus
- [ ] **7.1** investigate_fire score
- [ ] **7.2** mark_false_alarm score
- [ ] **8.1** view_global_state returns global snapshot in act response
- [ ] **9** Optional: equipment_malfunction, solar_flare, strong_winds, UI filters, focus path fix

---

## File reference

| Concern | Files |
|--------|--------|
| Action definitions (score, decay, cost) | `src/data/actions.ts` |
| Profile speeds, water/charge capacity | `src/data/profile-specs.ts` |
| Water source list | `src/data/water-sources.ts` |
| Act API | `src/app/api/public-agents/act/route.ts` |
| Perception API | `src/app/api/public-agents/perception/route.ts` |
| State API | `src/app/api/state/route.ts` |
| World tick | Supabase cron runs `run_ticks()` (see migrations); no HTTP tick API. |
| DB tick + movement | `supabase/migrations/20250214_tick_cron.sql`, `20250214_tick_agent_movement.sql`, `20250215_agent_movement_shortest_path.sql`, `20250215_run_ticks_include_movement.sql` |
| Agent auth | `src/lib/agent-auth.ts` |
| Treasury (payment check) | `src/lib/treasury.ts` |
| Skill file (agent contract) | `public/skill.md` |

---

*Last updated: plan created. Tick items in the checklist as you complete them.*
