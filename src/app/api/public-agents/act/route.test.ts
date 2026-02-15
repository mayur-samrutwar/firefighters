import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashSecret } from "@/lib/agent-auth";

const secret = "test-secret-123";
const secretHash = hashSecret(secret);

const agentRef = vi.hoisted(() => ({
  current: {
    id: "agent-1",
    type: "scout",
    wallet: "0x123",
    secret_hash: "",
    battery_pct: 100,
    paid_for_life_wei: "1000000000000000000",
    lat: 0,
    lng: 0,
    water_level: 0,
    water_capacity: 0,
    score: 0,
  },
}));
agentRef.current.secret_hash = hashSecret(secret);
const defaultAgent = agentRef.current;
const agentErrorRef = vi.hoisted(() => ({ current: null as Error | null }));
const firesRef = vi.hoisted(() => ({ current: [] as Array<{ id: string; lat: number; lng: number; intensity?: number }> }));
const targetAgentRef = vi.hoisted(() => ({
  current: null as { id: string; lat: number; lng: number; battery_pct: number } | null,
}));

vi.mock("@/lib/supabase-server", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "agents") {
        return {
          select: vi.fn((cols?: string) => {
            if (cols?.includes("secret_hash")) {
              return {
                eq: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: agentErrorRef.current ? null : agentRef.current,
                      error: agentErrorRef.current,
                    })
                  ),
                })),
              };
            }
            return {
              gt: vi.fn(() => Promise.resolve({ data: [] })),
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: targetAgentRef.current,
                    error: targetAgentRef.current ? null : new Error("not found"),
                  })
                ),
              })),
            };
          }),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      if (table === "game_state") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { tick: 0, earth_life_pct: 100 },
                  error: null,
                })
              ),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      if (table === "fires") {
        return {
          select: vi.fn(() => Promise.resolve({ data: firesRef.current })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        };
      }
      if (table === "bulletin") {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null })),
          select: vi.fn(() => ({
            order: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [] })) })),
          })),
        };
      }
      return {};
    }),
  },
}));

vi.mock("@/lib/agent-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-auth")>();
  return {
    ...actual,
    verifySecret: vi.fn((s: string, hash: string) => actual.verifySecret(s, hash)),
  };
});

vi.mock("@/lib/treasury", () => ({
  getAgentPayment: vi.fn(() =>
    Promise.resolve({ ok: true, totalPaidWei: BigInt("1000000000000000000") })
  ),
}));

const NextRequest = (await import("next/server")).NextRequest;

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/public-agents/act", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public-agents/act", () => {
  beforeEach(async () => {
    agentRef.current = { ...defaultAgent };
    agentRef.current.secret_hash = hashSecret(secret);
    agentErrorRef.current = null;
    firesRef.current = [];
    targetAgentRef.current = null;
    vi.mocked(await import("@/lib/treasury")).getAgentPayment.mockResolvedValue({
      ok: true,
      totalPaidWei: BigInt("1000000000000000000"),
    });
    process.env.MONAD_TESTNET_RPC_URL = "https://testnet.example.com";
    process.env.GAME_TREASURY_ADDRESS = "0xTreasury";
  });

  describe("authentication", () => {
    it("returns 401 when agentId is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(createRequest({ secret: "x" }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Missing");
    });
    it("returns 401 when secret is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(createRequest({ agentId: "a1" }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Missing");
    });
    it("returns 404 when agent not found", async () => {
      agentErrorRef.current = new Error("not found");
      const { POST } = await import("./route");
      const res = await POST(createRequest({ agentId: "missing", secret: "x" }));
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("not found");
    });
    it("returns 401 when secret is invalid", async () => {
      agentErrorRef.current = null;
      agentRef.current = { ...defaultAgent, secret_hash: hashSecret("other") };
      const { POST } = await import("./route");
      const res = await POST(createRequest({ agentId: defaultAgent.id, secret }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Invalid secret");
    });
  });

  describe("action validation — profile vs action", () => {
    it.each([
      ["satellite", "move_to", {}],
      ["scout", "change_route", {}],
      ["water_drone", "investigate_fire", {}],
      ["heavy_tanker", "recharge_agent", {}],
      ["supply_drone", "water_fire", {}],
    ] as const)(
      "returns 400 when profile %s uses disallowed action %s",
      async (profile, actionType, extra) => {
        agentRef.current = { ...defaultAgent, type: profile };
        const { POST } = await import("./route");
        const action: Record<string, unknown> = { type: actionType, ...extra };
        if (actionType === "move_to") action.lat = 0;
        if (actionType === "move_to") action.lng = 0;
        const res = await POST(
          createRequest({
            agentId: defaultAgent.id,
            secret,
            action,
          })
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("not allowed");
      }
    );
  });

  describe("move_to", () => {
    it("returns 400 when lat is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "move_to", lng: 0 },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("lat and lng");
    });
    it("returns 400 when lng is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "move_to", lat: 0 },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("lat and lng");
    });
    it("returns 400 when lat is not finite", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "move_to", lat: NaN, lng: 0 },
        })
      );
      expect(res.status).toBe(400);
    });
    it("accepts valid move_to and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "move_to", lat: 10, lng: -50 },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.action?.type).toBe("move_to");
    });
    it("accepts move_to with postBulletin (coordination) and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: {
            type: "move_to",
            lat: 10,
            lng: -50,
            postBulletin: { postType: "heading_to", message: "Heading to fire at 10,-50" },
          },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("move_to");
    });
    it("clamps lat to [-90, 90] and normalizes lng", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "move_to", lat: 95, lng: 400 },
        })
      );
      expect(res.status).toBe(200);
    });
  });

  describe("change_route (satellite)", () => {
    it("returns 400 when route has fewer than 2 points", async () => {
      agentRef.current = { ...defaultAgent, type: "satellite" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "change_route", route: [[0, 0]] },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("at least 2 points");
    });
    it("returns 400 when route is not an array", async () => {
      agentRef.current = { ...defaultAgent, type: "satellite" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "change_route", route: "not-array" },
        })
      );
      expect(res.status).toBe(400);
    });
    it("accepts valid change_route and returns 200", async () => {
      agentRef.current = { ...defaultAgent, type: "satellite" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "change_route", route: [[0, 0], [0, 10]] },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("change_route");
    });
  });

  describe("refill", () => {
    it("returns 400 when not at water source", async () => {
      agentRef.current = { ...defaultAgent, type: "water_drone", lat: 45, lng: 45 };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "refill" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("water source");
    });
    it("accepts refill when at water source (Pacific) and returns 200", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "water_drone",
        lat: 0,
        lng: -160,
        water_level: 0,
        water_capacity: 3,
      };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "refill" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("refill");
    });
  });

  describe("water_fire", () => {
    it("returns 400 when agent has no water", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "water_drone",
        water_level: 0,
        lat: 0,
        lng: -160,
      };
      firesRef.current = [{ id: "f1", lat: 0, lng: -160, intensity: 3 }];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "water_fire" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("water");
    });
    it("returns 400 when not near any fire", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "water_drone",
        water_level: 5,
        lat: 45,
        lng: 45,
      };
      firesRef.current = [];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "water_fire" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("near a fire");
    });
    it("accepts water_fire when agent has water and is near fire and returns 200", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "water_drone",
        water_level: 3,
        water_capacity: 3,
        lat: 0,
        lng: -160,
      };
      firesRef.current = [
        { id: "f1", lat: 0, lng: -160, intensity: 2 },
      ];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "water_fire" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("water_fire");
    });
  });

  describe("recharge_agent / emergency_recharge", () => {
    it("returns 400 when targetAgentId is missing", async () => {
      agentRef.current = { ...defaultAgent, type: "supply_drone" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "recharge_agent" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("targetAgentId");
    });
    it("returns 400 when trying to recharge self", async () => {
      agentRef.current = { ...defaultAgent, type: "supply_drone" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "recharge_agent", targetAgentId: defaultAgent.id },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("yourself");
    });
    it("returns 404 when target agent not found", async () => {
      agentRef.current = { ...defaultAgent, type: "supply_drone", lat: 0, lng: 0 };
      targetAgentRef.current = null;
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "recharge_agent", targetAgentId: "other-agent-id" },
        })
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("Target agent not found");
    });
    it("returns 400 when target agent is too far (>2°)", async () => {
      agentRef.current = { ...defaultAgent, type: "supply_drone", lat: 0, lng: 0, battery_pct: 100 };
      targetAgentRef.current = { id: "agent-2", lat: 0, lng: 10, battery_pct: 30 };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "recharge_agent", targetAgentId: "agent-2" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("within");
    });
    it("accepts recharge_agent when supply is near target and returns 200", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "supply_drone",
        lat: 0,
        lng: 0,
        battery_pct: 100,
      };
      targetAgentRef.current = {
        id: "agent-2",
        lat: 0,
        lng: 1,
        battery_pct: 30,
      };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "recharge_agent", targetAgentId: "agent-2" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("recharge_agent");
    });
    it("accepts emergency_recharge when supply is near target and returns 200", async () => {
      agentRef.current = {
        ...defaultAgent,
        type: "supply_drone",
        lat: 0,
        lng: 0,
        battery_pct: 100,
      };
      targetAgentRef.current = {
        id: "agent-2",
        lat: 0,
        lng: 1,
        battery_pct: 20,
      };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "emergency_recharge", targetAgentId: "agent-2" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("emergency_recharge");
    });
  });

  describe("investigate_fire", () => {
    it("returns 400 when scout not near any fire", async () => {
      agentRef.current = { ...defaultAgent, type: "scout", lat: 0, lng: 0 };
      firesRef.current = [];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "investigate_fire" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("near a fire");
    });
    it("accepts investigate_fire when scout is near fire and returns 200", async () => {
      agentRef.current = { ...defaultAgent, type: "scout", lat: 0, lng: 0 };
      firesRef.current = [{ id: "f1", lat: 0, lng: 0.5 }];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "investigate_fire" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("investigate_fire");
    });
  });

  describe("no_op, sit_idle, abort_current", () => {
    it("accepts no_op and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "no_op" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.action?.type).toBe("no_op");
    });
    it("accepts sit_idle and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "sit_idle" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("sit_idle");
    });
    it("accepts abort_current and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "abort_current" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("abort_current");
    });
  });

  describe("view_global_state", () => {
    it("returns 200 and actionResult with globalFires", async () => {
      firesRef.current = [{ id: "f1", lat: 10, lng: -50, intensity: 2 }];
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "view_global_state" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.actionResult).toBeDefined();
      expect(Array.isArray(json.actionResult?.globalFires)).toBe(true);
    });
  });

  describe("post_bulletin (coordination)", () => {
    it("accepts post_bulletin with heading_to and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "heading_to", message: "Going to fire" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("post_bulletin");
    });
    it("accepts post_bulletin with need_water and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "need_water", lat: 10, lng: -50 },
        })
      );
      expect(res.status).toBe(200);
    });
    it("accepts post_bulletin with need_charge and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "need_charge" },
        })
      );
      expect(res.status).toBe(200);
    });
    it("accepts post_bulletin with fire_report and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "fire_report", message: "Fire at 10,-50", fireId: "f1", lat: 10, lng: -50 },
        })
      );
      expect(res.status).toBe(200);
    });
    it("accepts post_bulletin with task_assign and targetAgentId and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "task_assign", message: "Head to fire", targetAgentId: "agent-2" },
        })
      );
      expect(res.status).toBe(200);
    });
    it("accepts post_bulletin with all_clear and returns 200", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "post_bulletin", postType: "all_clear", message: "Zone clear" },
        })
      );
      expect(res.status).toBe(200);
    });
  });

  describe("mark_false_alarm", () => {
    it("accepts mark_false_alarm and returns 200", async () => {
      agentRef.current = { ...defaultAgent, type: "scout" };
      const { POST } = await import("./route");
      const res = await POST(
        createRequest({
          agentId: defaultAgent.id,
          secret,
          action: { type: "mark_false_alarm", lat: 0, lng: 0 },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe("mark_false_alarm");
    });
  });
});
