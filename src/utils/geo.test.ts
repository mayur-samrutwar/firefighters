import { describe, it, expect } from "vitest";
import { angularDistanceDeg, clampLat, wrapLng } from "./geo";

describe("geo", () => {
  describe("angularDistanceDeg", () => {
    it("returns 0 for same point", () => {
      expect(angularDistanceDeg(0, 0, 0, 0)).toBe(0);
      expect(angularDistanceDeg(45, -120, 45, -120)).toBe(0);
    });
    it("returns 90 for point 90° away on equator", () => {
      const d = angularDistanceDeg(0, 0, 0, 90);
      expect(Math.abs(d - 90)).toBeLessThan(0.01);
    });
    it("returns 180 for antipodal points", () => {
      const d = angularDistanceDeg(0, 0, 0, 180);
      expect(Math.abs(d - 180)).toBeLessThan(0.01);
      const d2 = angularDistanceDeg(45, 0, -45, 180);
      expect(Math.abs(d2 - 180)).toBeLessThan(0.01);
    });
    it("is symmetric: dist(A,B) === dist(B,A)", () => {
      const a = { lat: 30, lng: -100 };
      const b = { lat: -20, lng: 50 };
      expect(angularDistanceDeg(a.lat, a.lng, b.lat, b.lng)).toBe(
        angularDistanceDeg(b.lat, b.lng, a.lat, a.lng)
      );
    });
    it("handles longitude wrap: (0, -180) and (0, 180) are same point", () => {
      const d = angularDistanceDeg(0, -180, 0, 180);
      expect(d).toBeLessThan(0.0001);
    });
    it("short distance ~1° for nearby points", () => {
      const d = angularDistanceDeg(0, 0, 0, 1);
      expect(d).toBeGreaterThan(0.9);
      expect(d).toBeLessThan(1.1);
    });
    it("returns finite number for any valid lat/lng", () => {
      expect(Number.isFinite(angularDistanceDeg(-90, -180, 90, 180))).toBe(true);
      expect(Number.isFinite(angularDistanceDeg(0, 0, 0, 360))).toBe(true);
    });
  });

  describe("clampLat", () => {
    it("clamps to [-85, 85]", () => {
      expect(clampLat(90)).toBe(85);
      expect(clampLat(-90)).toBe(-85);
      expect(clampLat(100)).toBe(85);
      expect(clampLat(-100)).toBe(-85);
    });
    it("leaves value unchanged when within range", () => {
      expect(clampLat(0)).toBe(0);
      expect(clampLat(45)).toBe(45);
      expect(clampLat(-45)).toBe(-45);
      expect(clampLat(84)).toBe(84);
      expect(clampLat(-84)).toBe(-84);
    });
    it("boundary 85 and -85 are unchanged", () => {
      expect(clampLat(85)).toBe(85);
      expect(clampLat(-85)).toBe(-85);
    });
  });

  describe("wrapLng", () => {
    it("leaves 180 as 180 (boundary)", () => {
      expect(wrapLng(180)).toBe(180);
    });
    it("wraps -180 to -180 (no change)", () => {
      expect(wrapLng(-180)).toBe(-180);
    });
    it("leaves lng in (-180, 180) unchanged", () => {
      expect(wrapLng(0)).toBe(0);
      expect(wrapLng(90)).toBe(90);
      expect(wrapLng(-90)).toBe(-90);
    });
    it("wraps 360 to 0", () => {
      expect(wrapLng(360)).toBe(0);
    });
    it("wraps 270 to -90", () => {
      expect(wrapLng(270)).toBe(-90);
    });
    it("wraps -270 to 90", () => {
      expect(wrapLng(-270)).toBe(90);
    });
  });
});
