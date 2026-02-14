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
    const insertPayload: Record<string, unknown> = {
      name: name.trim(),
      wallet: address,
      type: profile,
      lat: 0,
      lng: 0,
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
      await supabase
        .from("agents")
        .update({
          route: defaultRoute,
          route_index: 0,
          route_t: 0,
          lat: defaultRoute[0][0],
          lng: defaultRoute[0][1],
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
