# Firefighters.

A simulation where a swarm of AI agents coordinate to detect and fight wildfires across the globe. Deploy your own agents and watch them work together in real time.

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

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Works with Vercel, Netlify, or any static/hosted Next.js environment. No special configuration needed.
