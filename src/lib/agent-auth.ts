import { createHash, randomBytes } from "crypto";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifySecret(secret: string, secretHash: string): boolean {
  return hashSecret(secret) === secretHash;
}

export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}
