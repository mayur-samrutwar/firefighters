import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { supabase } from "@/lib/supabase-server";
import { hashSecret, generateSecret } from "@/lib/agent-auth";
import {
  getWaterCapacity,
  getDefaultSatelliteRouteByIndex,
  getSatelliteRouteIndexForAgent,
} from "@/data/profile-specs";
import type { AgentProfile } from "@/data/actions";

const PROFILES = ["satellite", "scout", "water_drone", "heavy_tanker", "supply_drone"] as const;

/** Random lat in [-85, 85] (avoid poles), lng in [-180, 180]. */
function randomSpawnCoords(): { lat: number; lng: number } {
  const lat = Math.round((Math.random() * 170 - 85) * 1e6) / 1e6;
  const lng = Math.round((Math.random() * 360 - 180) * 1e6) / 1e6;
  return { lat, lng };
}

/** Random position along a route: segment index and t in [0,1). Returns lat, lng, route_index, route_t. */
function randomPositionOnRoute(
  route: [number, number][]
): { lat: number; lng: number; route_index: number; route_t: number } {
  const n = route.length;
  if (n < 2) {
    return {
      lat: route[0]?.[0] ?? 0,
      lng: route[0]?.[1] ?? 0,
      route_index: 0,
      route_t: 0,
    };
  }
  const segCount = n - 1;
  const segIndex = Math.floor(Math.random() * segCount);
  const t = Math.random();
  const [lat0, lng0] = route[segIndex];
  const [lat1, lng1] = route[segIndex + 1];
  const lat = lat0 + (lat1 - lat0) * t;
  let lng = lng0 + (lng1 - lng0) * t;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    route_index: segIndex,
    route_t: t,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, publicAddress, profile } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid name" },
        { status: 400 }
      );
    }
    if (!publicAddress || typeof publicAddress !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid publicAddress" },
        { status: 400 }
      );
    }
    const address = publicAddress.trim();
    if (!ethers.isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }
    if (!profile || !PROFILES.includes(profile)) {
      return NextResponse.json(
        { error: "Missing or invalid profile; use one of: " + PROFILES.join(", ") },
        { status: 400 }
      );
    }

    const secret = generateSecret();
    const secretHash = hashSecret(secret);

    const waterCapacity = getWaterCapacity(profile as AgentProfile);
    const spawn = randomSpawnCoords();
    const insertPayload: Record<string, unknown> = {
      name: name.trim(),
      wallet: address,
      type: profile,
      lat: spawn.lat,
      lng: spawn.lng,
      battery_pct: 100,
      score: 0,
      secret_hash: secretHash,
      water_level: 0,
      water_capacity: waterCapacity,
    };

    const { data: agent, error } = await supabase
      .from("agents")
      .insert(insertPayload)
      .select("id, name, type")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (profile === "satellite" && agent?.id) {
      const routeIndex = getSatelliteRouteIndexForAgent(agent.id);
      const defaultRoute = getDefaultSatelliteRouteByIndex(routeIndex);
      const pos = randomPositionOnRoute(defaultRoute);
      await supabase
        .from("agents")
        .update({
          route: defaultRoute,
          route_index: pos.route_index,
          route_t: pos.route_t,
          lat: pos.lat,
          lng: pos.lng,
        })
        .eq("id", agent.id);
    }

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        profile: agent.type,
      },
      secret,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
