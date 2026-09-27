import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Single-user password hashing using Node's built-in scrypt (no extra
// dependency). Format: "<saltHex>:<hashHex>".

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
