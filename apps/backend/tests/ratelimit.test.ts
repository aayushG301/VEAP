import { describe, expect, it } from "vitest";

describe("rate limiting", () => {
  it("throttles auth and scan endpoints", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "4";
    process.env.SCAN_RATE_LIMIT_MAX = "3";
    const { default: request } = await import("supertest");
    const { connectDb } = await import("../src/config/db");
    await connectDb();
    const { createApp } = await import("../src/app");
    const app = createApp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await request(app).post("/api/v1/auth/login").send({ email: "a@b.co", password: "x" })).status);
    expect(codes.slice(0, 4).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
    const scans: number[] = [];
    for (let i = 0; i < 5; i++) scans.push((await request(app).get("/api/v1/emergency/" + "a".repeat(30))).status);
    expect(scans.slice(0, 3).every((c) => c === 404)).toBe(true);
    expect(scans[4]).toBe(429);
  });
});
