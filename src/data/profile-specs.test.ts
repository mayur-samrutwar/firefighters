import { describe, it, expect } from "vitest";
import {
  getSpeed,
  getWaterCapacity,
  getChargeCapacity,
  SATELLITE_SCAN_RADIUS_DEG,
  GLOBAL_SATELLITE_ROUTES,
  getDefaultSatelliteRouteByIndex,
  getSatelliteRouteIndexForAgent,
} from "./profile-specs";
import type { AgentProfile } from "./actions";

const PROFILES: AgentProfile[] = [
  "satellite",
  "scout",
  "water_drone",
  "heavy_tanker",
  "supply_drone",
];

describe("profile-specs", () => {
  describe("getSpeed", () => {
    it("satellite has speed 2 (used along route)", () => {
      expect(getSpeed("satellite")).toBe(2);
    });
    it("scout has highest ground speed (5)", () => {
      expect(getSpeed("scout")).toBe(5);
    });
    it("water_drone and supply_drone have speed 3", () => {
      expect(getSpeed("water_drone")).toBe(3);
      expect(getSpeed("supply_drone")).toBe(3);
    });
    it("heavy_tanker has lowest speed (1.5)", () => {
      expect(getSpeed("heavy_tanker")).toBe(1.5);
    });
    it("every profile has positive speed", () => {
      for (const profile of PROFILES) {
        expect(getSpeed(profile)).toBeGreaterThan(0);
      }
    });
    it("unknown profile returns 0", () => {
      expect(getSpeed("unknown" as AgentProfile)).toBe(0);
    });
  });

  describe("getWaterCapacity", () => {
    it("satellite, scout, supply_drone have 0 water capacity", () => {
      expect(getWaterCapacity("satellite")).toBe(0);
      expect(getWaterCapacity("scout")).toBe(0);
      expect(getWaterCapacity("supply_drone")).toBe(0);
    });
    it("water_drone has capacity 3", () => {
      expect(getWaterCapacity("water_drone")).toBe(3);
    });
    it("heavy_tanker has capacity 10", () => {
      expect(getWaterCapacity("heavy_tanker")).toBe(10);
    });
    it("unknown profile returns 0", () => {
      expect(getWaterCapacity("unknown" as AgentProfile)).toBe(0);
    });
  });

  describe("getChargeCapacity", () => {
    it("supply_drone has charge capacity 100", () => {
      expect(getChargeCapacity("supply_drone")).toBe(100);
    });
    it("all other profiles have 0 charge capacity", () => {
      expect(getChargeCapacity("satellite")).toBe(0);
      expect(getChargeCapacity("scout")).toBe(0);
      expect(getChargeCapacity("water_drone")).toBe(0);
      expect(getChargeCapacity("heavy_tanker")).toBe(0);
    });
    it("unknown profile returns 0", () => {
      expect(getChargeCapacity("unknown" as AgentProfile)).toBe(0);
    });
  });

  describe("SATELLITE_SCAN_RADIUS_DEG", () => {
    it("is 5 degrees", () => {
      expect(SATELLITE_SCAN_RADIUS_DEG).toBe(5);
    });
  });

  describe("GLOBAL_SATELLITE_ROUTES", () => {
    it("is non-empty array of routes", () => {
      expect(Array.isArray(GLOBAL_SATELLITE_ROUTES)).toBe(true);
      expect(GLOBAL_SATELLITE_ROUTES.length).toBeGreaterThan(0);
    });
    it("each route is array of [lat, lng] waypoints", () => {
      for (const route of GLOBAL_SATELLITE_ROUTES) {
        expect(Array.isArray(route)).toBe(true);
        expect(route.length).toBeGreaterThanOrEqual(2);
        for (const pt of route) {
          expect(Array.isArray(pt)).toBe(true);
          expect(pt.length).toBe(2);
          expect(typeof pt[0]).toBe("number");
          expect(typeof pt[1]).toBe("number");
          expect(pt[0]).toBeGreaterThanOrEqual(-90);
          expect(pt[0]).toBeLessThanOrEqual(90);
          expect(pt[1]).toBeGreaterThanOrEqual(-180);
          expect(pt[1]).toBeLessThanOrEqual(180);
        }
      }
    });
    it("latitude bands cover range (e.g. -80 to 80)", () => {
      const lats = new Set<number>();
      for (const route of GLOBAL_SATELLITE_ROUTES) {
        for (const [lat] of route) {
          lats.add(lat);
        }
      }
      expect(lats.size).toBeGreaterThan(1);
    });
  });

  describe("getDefaultSatelliteRouteByIndex", () => {
    it("returns a copy of the route (not shared reference)", () => {
      const r0 = getDefaultSatelliteRouteByIndex(0);
      const r0again = getDefaultSatelliteRouteByIndex(0);
      expect(r0).toEqual(r0again);
      expect(r0).not.toBe(r0again);
    });
    it("wraps index with modulo", () => {
      const r0 = getDefaultSatelliteRouteByIndex(0);
      const rN = getDefaultSatelliteRouteByIndex(GLOBAL_SATELLITE_ROUTES.length);
      expect(r0).toEqual(rN);
    });
    it("large index wraps via modulo", () => {
      const r = getDefaultSatelliteRouteByIndex(GLOBAL_SATELLITE_ROUTES.length + 5);
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getSatelliteRouteIndexForAgent", () => {
    it("returns number in [0, GLOBAL_SATELLITE_ROUTES.length)", () => {
      const idx = getSatelliteRouteIndexForAgent("agent-1");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(GLOBAL_SATELLITE_ROUTES.length);
    });
    it("same agent id always gets same index", () => {
      expect(getSatelliteRouteIndexForAgent("foo")).toBe(getSatelliteRouteIndexForAgent("foo"));
    });
    it("different agent ids can get same or different index", () => {
      const i1 = getSatelliteRouteIndexForAgent("a");
      const i2 = getSatelliteRouteIndexForAgent("b");
      expect(typeof i1).toBe("number");
      expect(typeof i2).toBe("number");
      expect(i1).toBeGreaterThanOrEqual(0);
      expect(i2).toBeGreaterThanOrEqual(0);
    });
  });
});
