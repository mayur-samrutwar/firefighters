import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret, generateSecret } from "./agent-auth";

describe("agent-auth", () => {
  describe("hashSecret", () => {
    it("returns hex string of length 64", () => {
      const h = hashSecret("test-secret");
      expect(typeof h).toBe("string");
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
    it("same input produces same hash", () => {
      expect(hashSecret("abc")).toBe(hashSecret("abc"));
    });
    it("different input produces different hash", () => {
      expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
    });
  });

  describe("verifySecret", () => {
    it("returns true when secret hashes to stored hash", () => {
      const secret = "my-secret";
      const hash = hashSecret(secret);
      expect(verifySecret(secret, hash)).toBe(true);
    });
    it("returns false when secret does not match hash", () => {
      const hash = hashSecret("correct");
      expect(verifySecret("wrong", hash)).toBe(false);
    });
    it("returns false for empty secret with non-empty hash", () => {
      const hash = hashSecret("something");
      expect(verifySecret("", hash)).toBe(false);
    });
  });

  describe("generateSecret", () => {
    it("returns hex string", () => {
      const s = generateSecret();
      expect(typeof s).toBe("string");
      expect(s).toMatch(/^[a-f0-9]+$/);
    });
    it("returns different value each time (high probability)", () => {
      const a = generateSecret();
      const b = generateSecret();
      expect(a).not.toBe(b);
    });
    it("generated secret verifies against its hash", () => {
      const secret = generateSecret();
      const hash = hashSecret(secret);
      expect(verifySecret(secret, hash)).toBe(true);
    });
  });
});
