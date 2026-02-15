import { describe, it, expect } from "vitest";
import { WATER_SOURCES, WATER_SOURCE_RADIUS_DEG, isAtWaterSource } from "./water-sources";
import { angularDistanceDeg } from "@/utils/geo";

describe("water-sources", () => {
  describe("WATER_SOURCE_RADIUS_DEG", () => {
    it("is 2.5 degrees", () => {
      expect(WATER_SOURCE_RADIUS_DEG).toBe(2.5);
    });
  });

  describe("WATER_SOURCES", () => {
    it("is non-empty array", () => {
      expect(Array.isArray(WATER_SOURCES)).toBe(true);
      expect(WATER_SOURCES.length).toBeGreaterThan(0);
    });
    it("each source has id, lat, lng, name", () => {
      for (const src of WATER_SOURCES) {
        expect(src).toHaveProperty("id", expect.any(String));
        expect(src).toHaveProperty("lat", expect.any(Number));
        expect(src).toHaveProperty("lng", expect.any(Number));
        expect(src).toHaveProperty("name", expect.any(String));
        expect(src.lat).toBeGreaterThanOrEqual(-90);
        expect(src.lat).toBeLessThanOrEqual(90);
        expect(src.lng).toBeGreaterThanOrEqual(-180);
        expect(src.lng).toBeLessThanOrEqual(180);
      }
    });
    it("has unique ids", () => {
      const ids = WATER_SOURCES.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("isAtWaterSource", () => {
    it("returns true when exactly at a source", () => {
      for (const src of WATER_SOURCES) {
        expect(isAtWaterSource(src.lat, src.lng)).toBe(true);
      }
    });
    it("returns true when within WATER_SOURCE_RADIUS_DEG of a source", () => {
      const src = WATER_SOURCES[0];
      const dist = WATER_SOURCE_RADIUS_DEG * 0.5;
      const lat = src.lat + dist * 0.6;
      const lng = src.lng + dist * 0.8;
      const d = angularDistanceDeg(src.lat, src.lng, lat, lng);
      if (d <= WATER_SOURCE_RADIUS_DEG) {
        expect(isAtWaterSource(lat, lng)).toBe(true);
      }
    });
    it("returns false when far from all sources", () => {
      expect(isAtWaterSource(0, 0)).toBe(false);
      expect(isAtWaterSource(45, 45)).toBe(false);
      expect(isAtWaterSource(-60, 100)).toBe(false);
    });
    it("returns false at boundary just beyond radius (Pacific central)", () => {
      const pacific = WATER_SOURCES.find((s) => s.id === "pacific-central");
      if (!pacific) return;
      const beyond = WATER_SOURCE_RADIUS_DEG + 0.5;
      const lat = pacific.lat + beyond;
      const lng = pacific.lng;
      const d = angularDistanceDeg(pacific.lat, pacific.lng, lat, lng);
      expect(d).toBeGreaterThan(WATER_SOURCE_RADIUS_DEG);
      expect(isAtWaterSource(lat, lng)).toBe(false);
    });
    it("Pacific Ocean (0, -160) is at water source", () => {
      expect(isAtWaterSource(0, -160)).toBe(true);
    });
    it("Mediterranean (38, 12) is at water source", () => {
      expect(isAtWaterSource(38, 12)).toBe(true);
    });
    it("middle of Sahara (25, 10) is not at water source", () => {
      expect(isAtWaterSource(25, 10)).toBe(false);
    });
  });
});
