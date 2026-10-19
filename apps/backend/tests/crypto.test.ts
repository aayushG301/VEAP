import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { decrypt, encrypt } from "../src/security/crypto";
import { createQrToken, parseQrToken } from "../src/security/tokens";

const key = crypto.randomBytes(32);
describe("AES-256-GCM", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("hello", key, "ctx"), b = encrypt("hello", key, "ctx");
    expect(a).not.toEqual(b);
    expect(decrypt(a, key, "ctx")).toBe("hello");
  });
  it("rejects tampered ciphertext", () => {
    const c = encrypt("secret", key, "ctx").split(".");
    c[3] = Buffer.from("tampered!!").toString("base64url");
    expect(() => decrypt(c.join("."), key, "ctx")).toThrow();
  });
  it("rejects wrong AAD (ciphertext cannot be moved between fields/users)", () => {
    expect(() => decrypt(encrypt("x", key, "user1:allergies"), key, "user2:allergies")).toThrow();
  });
  it("rejects wrong key", () => {
    expect(() => decrypt(encrypt("x", key), crypto.randomBytes(32))).toThrow();
  });
});
describe("QR tokens", () => {
  it("accepts genuine tokens and rejects forged/garbled ones", () => {
    const { token } = createQrToken();
    expect(parseQrToken(token)).not.toBeNull();
    const [id] = token.split(".");
    expect(parseQrToken(`${id}.deadbeefdeadbeefdead`)).toBeNull();
    expect(parseQrToken("garbage")).toBeNull();
    expect(parseQrToken("a".repeat(200))).toBeNull();
  });
  it("tokens are unique with 128-bit ids", () => {
    const s = new Set(Array.from({ length: 200 }, () => createQrToken().token));
    expect(s.size).toBe(200);
  });
});
