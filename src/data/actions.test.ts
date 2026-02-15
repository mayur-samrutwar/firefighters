import { describe, it, expect } from "vitest";
import {
  AGENT_PROFILES,
  type AgentProfile,
  ACTION_DEFINITIONS,
  getActionDef,
  isActionAllowedForProfile,
  getAllowedActionTypes,
  getScoreForAction,
  getBatteryDecayMultiplier,
  getBatteryCostPercent,
  SCORE_EXTINGUISH,
  SCORE_FIRST_FIRE_REPORT,
} from "./actions";

describe("actions", () => {
  describe("AGENT_PROFILES", () => {
    it("has exactly 5 profile types", () => {
      expect(AGENT_PROFILES).toHaveLength(5);
    });
    it("includes satellite, scout, water_drone, heavy_tanker, supply_drone", () => {
      expect(AGENT_PROFILES).toContain("satellite");
      expect(AGENT_PROFILES).toContain("scout");
      expect(AGENT_PROFILES).toContain("water_drone");
      expect(AGENT_PROFILES).toContain("heavy_tanker");
      expect(AGENT_PROFILES).toContain("supply_drone");
    });
  });

  describe("ACTION_DEFINITIONS", () => {
    it("has all expected action types", () => {
      const types = ACTION_DEFINITIONS.map((a) => a.type);
      expect(types).toContain("no_op");
      expect(types).toContain("sit_idle");
      expect(types).toContain("post_bulletin");
      expect(types).toContain("acknowledge_task");
      expect(types).toContain("abort_current");
      expect(types).toContain("view_global_state");
      expect(types).toContain("set_scan_focus");
      expect(types).toContain("change_route");
      expect(types).toContain("prioritize_scan_zone");
      expect(types).toContain("move_to");
      expect(types).toContain("investigate_fire");
      expect(types).toContain("mark_false_alarm");
      expect(types).toContain("water_fire");
      expect(types).toContain("refill");
      expect(types).toContain("request_backup");
      expect(types).toContain("recharge_agent");
      expect(types).toContain("emergency_recharge");
    });
    it("has no duplicate action types", () => {
      const types = ACTION_DEFINITIONS.map((a) => a.type);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  describe("getActionDef", () => {
    it("returns definition for known action type", () => {
      expect(getActionDef("move_to")).toBeDefined();
      expect(getActionDef("move_to")?.type).toBe("move_to");
    });
    it("returns undefined for unknown action type", () => {
      expect(getActionDef("unknown_action")).toBeUndefined();
      expect(getActionDef("")).toBeUndefined();
    });
    it("returns correct structure for every defined action", () => {
      for (const def of ACTION_DEFINITIONS) {
        const found = getActionDef(def.type);
        expect(found).toBe(def);
        expect(found).toHaveProperty("type", def.type);
        expect(found).toHaveProperty("profiles");
        expect(typeof found?.score).toBe("number");
        expect(typeof found?.batteryDecayMultiplier).toBe("number");
      }
    });
  });

  describe("isActionAllowedForProfile — common actions (all profiles)", () => {
    const commonActions = [
      "no_op",
      "sit_idle",
      "post_bulletin",
      "acknowledge_task",
      "abort_current",
      "view_global_state",
    ];
    for (const profile of AGENT_PROFILES) {
      for (const actionType of commonActions) {
        it(`${profile} can use ${actionType}`, () => {
          expect(isActionAllowedForProfile(actionType, profile as AgentProfile)).toBe(true);
        });
      }
    }
  });

  describe("isActionAllowedForProfile — satellite-only actions", () => {
    const satelliteOnly = ["set_scan_focus", "change_route", "prioritize_scan_zone"];
    it("satellite can use all satellite-only actions", () => {
      for (const actionType of satelliteOnly) {
        expect(isActionAllowedForProfile(actionType, "satellite")).toBe(true);
      }
    });
    it("non-satellite cannot use satellite-only actions", () => {
      const others: AgentProfile[] = ["scout", "water_drone", "heavy_tanker", "supply_drone"];
      for (const actionType of satelliteOnly) {
        for (const profile of others) {
          expect(isActionAllowedForProfile(actionType, profile)).toBe(false);
        }
      }
    });
  });

  describe("isActionAllowedForProfile — ground/flying movement (no satellite)", () => {
    it("scout, water_drone, heavy_tanker, supply_drone can move_to", () => {
      for (const profile of ["scout", "water_drone", "heavy_tanker", "supply_drone"] as AgentProfile[]) {
        expect(isActionAllowedForProfile("move_to", profile)).toBe(true);
      }
    });
    it("satellite cannot move_to", () => {
      expect(isActionAllowedForProfile("move_to", "satellite")).toBe(false);
    });
  });

  describe("isActionAllowedForProfile — scout-only actions", () => {
    const scoutOnly = ["investigate_fire", "mark_false_alarm"];
    it("scout can use investigate_fire and mark_false_alarm", () => {
      for (const actionType of scoutOnly) {
        expect(isActionAllowedForProfile(actionType, "scout")).toBe(true);
      }
    });
    it("non-scout cannot use scout-only actions", () => {
      const others: AgentProfile[] = ["satellite", "water_drone", "heavy_tanker", "supply_drone"];
      for (const actionType of scoutOnly) {
        for (const profile of others) {
          expect(isActionAllowedForProfile(actionType, profile)).toBe(false);
        }
      }
    });
  });

  describe("isActionAllowedForProfile — water carrier actions", () => {
    const waterActions = ["water_fire", "refill", "request_backup"];
    it("water_drone and heavy_tanker can water_fire, refill, request_backup", () => {
      for (const profile of ["water_drone", "heavy_tanker"] as AgentProfile[]) {
        for (const actionType of waterActions) {
          expect(isActionAllowedForProfile(actionType, profile)).toBe(true);
        }
      }
    });
    it("satellite, scout, supply_drone cannot use water_fire, refill, request_backup", () => {
      const others: AgentProfile[] = ["satellite", "scout", "supply_drone"];
      for (const actionType of waterActions) {
        for (const profile of others) {
          expect(isActionAllowedForProfile(actionType, profile)).toBe(false);
        }
      }
    });
  });

  describe("isActionAllowedForProfile — supply_drone recharge actions", () => {
    const rechargeActions = ["recharge_agent", "emergency_recharge"];
    it("supply_drone can recharge_agent and emergency_recharge", () => {
      for (const actionType of rechargeActions) {
        expect(isActionAllowedForProfile(actionType, "supply_drone")).toBe(true);
      }
    });
    it("non-supply_drone cannot recharge", () => {
      const others: AgentProfile[] = ["satellite", "scout", "water_drone", "heavy_tanker"];
      for (const actionType of rechargeActions) {
        for (const profile of others) {
          expect(isActionAllowedForProfile(actionType, profile)).toBe(false);
        }
      }
    });
  });

  describe("isActionAllowedForProfile — unknown action", () => {
    it("returns false for unknown action for any profile", () => {
      for (const profile of AGENT_PROFILES) {
        expect(isActionAllowedForProfile("fake_action", profile as AgentProfile)).toBe(false);
      }
    });
  });

  describe("getAllowedActionTypes", () => {
    it("satellite has common + set_scan_focus, change_route, prioritize_scan_zone", () => {
      const allowed = getAllowedActionTypes("satellite");
      expect(allowed).toContain("no_op");
      expect(allowed).toContain("view_global_state");
      expect(allowed).toContain("set_scan_focus");
      expect(allowed).toContain("change_route");
      expect(allowed).toContain("prioritize_scan_zone");
      expect(allowed).not.toContain("move_to");
      expect(allowed).not.toContain("water_fire");
      expect(allowed).not.toContain("recharge_agent");
    });
    it("scout has common + move_to, investigate_fire, mark_false_alarm", () => {
      const allowed = getAllowedActionTypes("scout");
      expect(allowed).toContain("move_to");
      expect(allowed).toContain("investigate_fire");
      expect(allowed).toContain("mark_false_alarm");
      expect(allowed).not.toContain("change_route");
      expect(allowed).not.toContain("water_fire");
      expect(allowed).not.toContain("refill");
    });
    it("water_drone has common + move_to, water_fire, refill, request_backup", () => {
      const allowed = getAllowedActionTypes("water_drone");
      expect(allowed).toContain("move_to");
      expect(allowed).toContain("water_fire");
      expect(allowed).toContain("refill");
      expect(allowed).toContain("request_backup");
      expect(allowed).not.toContain("recharge_agent");
    });
    it("heavy_tanker has same water actions as water_drone", () => {
      const allowed = getAllowedActionTypes("heavy_tanker");
      expect(allowed).toContain("water_fire");
      expect(allowed).toContain("refill");
      expect(allowed).toContain("request_backup");
    });
    it("supply_drone has common + move_to, recharge_agent, emergency_recharge", () => {
      const allowed = getAllowedActionTypes("supply_drone");
      expect(allowed).toContain("move_to");
      expect(allowed).toContain("recharge_agent");
      expect(allowed).toContain("emergency_recharge");
      expect(allowed).not.toContain("water_fire");
      expect(allowed).not.toContain("refill");
    });
    it("each profile has at least 6 actions", () => {
      for (const profile of AGENT_PROFILES) {
        const allowed = getAllowedActionTypes(profile as AgentProfile);
        expect(allowed.length).toBeGreaterThanOrEqual(6);
      }
    });
  });

  describe("getScoreForAction", () => {
    it("no_op, sit_idle, post_bulletin, abort_current, change_route, refill, request_backup have 0 score", () => {
      const zeroScore = [
        "no_op",
        "sit_idle",
        "post_bulletin",
        "acknowledge_task",
        "abort_current",
        "view_global_state",
        "set_scan_focus",
        "change_route",
        "prioritize_scan_zone",
        "move_to",
        "refill",
        "request_backup",
      ];
      for (const actionType of zeroScore) {
        expect(getScoreForAction(actionType)).toBe(0);
      }
    });
    it("investigate_fire scores 6", () => {
      expect(getScoreForAction("investigate_fire")).toBe(6);
    });
    it("mark_false_alarm scores 2", () => {
      expect(getScoreForAction("mark_false_alarm")).toBe(2);
    });
    it("water_fire scores 6", () => {
      expect(getScoreForAction("water_fire")).toBe(6);
    });
    it("recharge_agent and emergency_recharge score 10", () => {
      expect(getScoreForAction("recharge_agent")).toBe(10);
      expect(getScoreForAction("emergency_recharge")).toBe(10);
    });
    it("unknown action returns 0", () => {
      expect(getScoreForAction("unknown")).toBe(0);
    });
  });

  describe("getBatteryDecayMultiplier", () => {
    it("no_op and sit_idle have low multiplier (< 1)", () => {
      expect(getBatteryDecayMultiplier("no_op")).toBeLessThan(1);
      expect(getBatteryDecayMultiplier("sit_idle")).toBeLessThan(1);
    });
    it("move_to has multiplier > 1", () => {
      expect(getBatteryDecayMultiplier("move_to")).toBeGreaterThan(1);
    });
    it("water_fire has high multiplier", () => {
      expect(getBatteryDecayMultiplier("water_fire")).toBeGreaterThan(1);
    });
    it("emergency_recharge has higher multiplier than recharge_agent", () => {
      expect(getBatteryDecayMultiplier("emergency_recharge")).toBeGreaterThan(
        getBatteryDecayMultiplier("recharge_agent")
      );
    });
    it("unknown action returns 1.0", () => {
      expect(getBatteryDecayMultiplier("unknown")).toBe(1);
    });
    it("every defined action has positive multiplier", () => {
      for (const def of ACTION_DEFINITIONS) {
        const m = getBatteryDecayMultiplier(def.type);
        expect(m).toBeGreaterThan(0);
        expect(Number.isFinite(m)).toBe(true);
      }
    });
  });

  describe("getBatteryCostPercent", () => {
    it("view_global_state costs 5%", () => {
      expect(getBatteryCostPercent("view_global_state")).toBe(5);
    });
    it("all other actions have 0 one-time cost", () => {
      const noCost = ACTION_DEFINITIONS.filter((a) => a.type !== "view_global_state");
      for (const def of noCost) {
        expect(getBatteryCostPercent(def.type)).toBe(0);
      }
    });
    it("unknown action returns 0", () => {
      expect(getBatteryCostPercent("unknown")).toBe(0);
    });
  });

  describe("SCORE_EXTINGUISH and SCORE_FIRST_FIRE_REPORT", () => {
    it("SCORE_EXTINGUISH is 28", () => {
      expect(SCORE_EXTINGUISH).toBe(28);
    });
    it("SCORE_FIRST_FIRE_REPORT is 4", () => {
      expect(SCORE_FIRST_FIRE_REPORT).toBe(4);
    });
  });
});
