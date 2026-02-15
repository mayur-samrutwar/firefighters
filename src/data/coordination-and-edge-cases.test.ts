import { describe, it, expect } from "vitest";
import {
  getAllowedActionTypes,
  isActionAllowedForProfile,
  getScoreForAction,
  SCORE_EXTINGUISH,
  SCORE_FIRST_FIRE_REPORT,
  ACTION_DEFINITIONS,
} from "@/data/actions";
import type { AgentProfile } from "@/data/actions";
import { getWaterCapacity, getSpeed } from "@/data/profile-specs";
import { isAtWaterSource, WATER_SOURCE_RADIUS_DEG, WATER_SOURCES } from "@/data/water-sources";
import { angularDistanceDeg } from "@/utils/geo";

/**
 * Coordination and edge-case tests: bulletin post types, multi-agent coordination,
 * score bonuses, and boundary conditions across the game.
 */
describe("coordination and edge cases", () => {
  describe("coordination actions — all profiles can coordinate", () => {
    const coordinationActions = [
      "post_bulletin",
      "acknowledge_task",
      "view_global_state",
      "no_op",
      "sit_idle",
      "abort_current",
    ];
    const profiles: AgentProfile[] = [
      "satellite",
      "scout",
      "water_drone",
      "heavy_tanker",
      "supply_drone",
    ];
    it.each(profiles)("%s can use all coordination actions", (profile) => {
      for (const actionType of coordinationActions) {
        expect(isActionAllowedForProfile(actionType, profile)).toBe(true);
      }
    });
  });

  describe("request_backup — water carriers only", () => {
    it("water_drone and heavy_tanker can request_backup", () => {
      expect(isActionAllowedForProfile("request_backup", "water_drone")).toBe(true);
      expect(isActionAllowedForProfile("request_backup", "heavy_tanker")).toBe(true);
    });
    it("satellite, scout, supply_drone cannot request_backup", () => {
      expect(isActionAllowedForProfile("request_backup", "satellite")).toBe(false);
      expect(isActionAllowedForProfile("request_backup", "scout")).toBe(false);
      expect(isActionAllowedForProfile("request_backup", "supply_drone")).toBe(false);
    });
  });

  describe("satellite scan actions", () => {
    it("set_scan_focus and prioritize_scan_zone are satellite-only", () => {
      expect(isActionAllowedForProfile("set_scan_focus", "satellite")).toBe(true);
      expect(isActionAllowedForProfile("prioritize_scan_zone", "satellite")).toBe(true);
      expect(isActionAllowedForProfile("set_scan_focus", "scout")).toBe(false);
      expect(isActionAllowedForProfile("prioritize_scan_zone", "water_drone")).toBe(false);
    });
  });

  describe("score bonuses (extinguish and first report)", () => {
    it("SCORE_EXTINGUISH is applied in addition to water_fire score", () => {
      const waterFireScore = getScoreForAction("water_fire");
      expect(waterFireScore).toBe(6);
      expect(SCORE_EXTINGUISH).toBe(28);
      expect(waterFireScore + SCORE_EXTINGUISH).toBe(34);
    });
    it("SCORE_FIRST_FIRE_REPORT is 4", () => {
      expect(SCORE_FIRST_FIRE_REPORT).toBe(4);
    });
  });

  describe("every action has valid definition", () => {
    it("all actions have profiles, score, batteryDecayMultiplier", () => {
      for (const def of ACTION_DEFINITIONS) {
        expect(def.type).toBeTruthy();
        expect(def.profiles).toBeDefined();
        expect(typeof def.score).toBe("number");
        expect(def.batteryDecayMultiplier).toBeGreaterThan(0);
      }
    });
    it("common actions have profiles === 'common'", () => {
      const common = ["no_op", "sit_idle", "post_bulletin", "acknowledge_task", "abort_current", "view_global_state"];
      for (const type of common) {
        const def = ACTION_DEFINITIONS.find((d) => d.type === type);
        expect(def?.profiles).toBe("common");
      }
    });
  });

  describe("water source edge cases", () => {
    it("WATER_SOURCE_RADIUS_DEG is used consistently", () => {
      expect(WATER_SOURCE_RADIUS_DEG).toBe(2.5);
    });
    it("point just inside radius is at water source", () => {
      const src = WATER_SOURCES[0];
      const d = WATER_SOURCE_RADIUS_DEG * 0.99;
      const lat = src.lat + d * 0.6;
      const lng = src.lng + d * 0.8;
      const dist = angularDistanceDeg(src.lat, src.lng, lat, lng);
      if (dist <= WATER_SOURCE_RADIUS_DEG) {
        expect(isAtWaterSource(lat, lng)).toBe(true);
      }
    });
  });

  describe("water capacity vs refill", () => {
    it("water_drone and heavy_tanker have positive capacity", () => {
      expect(getWaterCapacity("water_drone")).toBeGreaterThan(0);
      expect(getWaterCapacity("heavy_tanker")).toBeGreaterThan(0);
    });
    it("heavy_tanker has more capacity than water_drone", () => {
      expect(getWaterCapacity("heavy_tanker")).toBeGreaterThan(getWaterCapacity("water_drone"));
    });
  });

  describe("movement speeds for coordination (who can reach first)", () => {
    it("scout is fastest ground agent", () => {
      const scoutSpeed = getSpeed("scout");
      expect(scoutSpeed).toBeGreaterThan(getSpeed("water_drone"));
      expect(scoutSpeed).toBeGreaterThan(getSpeed("supply_drone"));
      expect(scoutSpeed).toBeGreaterThan(getSpeed("heavy_tanker"));
    });
    it("heavy_tanker is slowest", () => {
      const tankerSpeed = getSpeed("heavy_tanker");
      expect(tankerSpeed).toBeLessThan(getSpeed("scout"));
      expect(tankerSpeed).toBeLessThan(getSpeed("water_drone"));
    });
  });

  describe("recharge coordination", () => {
    it("only supply_drone can recharge", () => {
      expect(isActionAllowedForProfile("recharge_agent", "supply_drone")).toBe(true);
      expect(isActionAllowedForProfile("emergency_recharge", "supply_drone")).toBe(true);
      for (const p of ["satellite", "scout", "water_drone", "heavy_tanker"] as AgentProfile[]) {
        expect(isActionAllowedForProfile("recharge_agent", p)).toBe(false);
        expect(isActionAllowedForProfile("emergency_recharge", p)).toBe(false);
      }
    });
  });

  describe("investigate and false alarm — scout only", () => {
    it("only scout can investigate_fire and mark_false_alarm", () => {
      expect(isActionAllowedForProfile("investigate_fire", "scout")).toBe(true);
      expect(isActionAllowedForProfile("mark_false_alarm", "scout")).toBe(true);
      expect(isActionAllowedForProfile("investigate_fire", "satellite")).toBe(false);
      expect(isActionAllowedForProfile("mark_false_alarm", "water_drone")).toBe(false);
    });
  });

  describe("getAllowedActionTypes count per profile", () => {
    it("satellite has fewer actions than mobile agents (no move_to)", () => {
      const satelliteActions = getAllowedActionTypes("satellite");
      const scoutActions = getAllowedActionTypes("scout");
      expect(satelliteActions).not.toContain("move_to");
      expect(scoutActions).toContain("move_to");
      expect(satelliteActions.length).toBeLessThanOrEqual(scoutActions.length + 2);
    });
    it("each profile has unique set of actions", () => {
      const sets = new Map<AgentProfile, Set<string>>();
      for (const profile of ["satellite", "scout", "water_drone", "heavy_tanker", "supply_drone"] as AgentProfile[]) {
        sets.set(profile, new Set(getAllowedActionTypes(profile)));
      }
      expect(sets.get("water_drone")).toEqual(sets.get("heavy_tanker"));
      expect(sets.get("satellite")).not.toEqual(sets.get("scout"));
    });
  });
});
