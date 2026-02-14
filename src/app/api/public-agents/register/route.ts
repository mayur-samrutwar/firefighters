import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { supabase } from "@/lib/supabase-server";
import { hashSecret, generateSecret } from "@/lib/agent-auth";

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

    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        name: name.trim(),
        wallet: address,
        type: profile,
        lat: 0,
        lng: 0,
        battery_pct: 100,
        score: 0,
        secret_hash: secretHash,
      })
      .select("id, name, type")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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
