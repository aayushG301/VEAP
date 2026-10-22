import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
describe("trust proxy hops", () => {
  const ipFor = (hops: number, xff: string) => { const a = express(); a.set("trust proxy", hops); a.get("/", (req, res) => { res.json({ ip: req.ip }); }); return request(a).get("/").set("X-Forwarded-For", xff).then((r) => r.body.ip); };
  it("1 hop sees the proxy (Vercel), 2 hops sees the real client", async () => {
    // client 203.0.113.9 -> Vercel (adds client) -> Render (adds Vercel's IP 76.76.21.1)
    expect(await ipFor(1, "203.0.113.9, 76.76.21.1")).toBe("76.76.21.1");
    expect(await ipFor(2, "203.0.113.9, 76.76.21.1")).toBe("203.0.113.9");
  });
});
