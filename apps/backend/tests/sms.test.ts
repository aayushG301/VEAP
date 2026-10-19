import { afterEach, describe, expect, it, vi } from "vitest";

process.env.OTP_MODE = "twilio";
process.env.TWILIO_ACCOUNT_SID = "ACtest123";
process.env.TWILIO_AUTH_TOKEN = "token123";
process.env.TWILIO_PHONE_NUMBER = "+15005550006";
const { api, app, patientWithQr, request } = await import("./helpers");
const { toE164, maskPhone } = await import("../src/services/sms.service");

afterEach(() => vi.restoreAllMocks());
const realFetch = globalThis.fetch;
const twilioOnly = (impl: (body: URLSearchParams, init: any) => Response) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => (String(u).startsWith("https://api.twilio.com/") ? impl(new URLSearchParams(String(init.body)), init) : realFetch(u, init)));

describe("phone helpers", () => {
  it("normalizes to E.164", () => {
    expect(toE164("+91 98765-43210")).toBe("+919876543210");
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("0091 98765 43210")).toBe("+919876543210");
    expect(toE164("abc")).toBeNull();
    expect(maskPhone("+919876543210")).toBe("+91 ******3210");
  });
});

describe("Twilio delivery", () => {
  it("texts the emergency contact, never returns the code to the browser, and the code works", async () => {
    let captured: URLSearchParams | null = null; let auth = "";
    twilioOnly((body, init) => { captured = body; auth = init.headers.Authorization; return new Response("{}", { status: 201 }); });
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.status).toBe(201);
    expect(o.body.devOtp).toBeUndefined();
    expect(o.body.delivery).toBe("twilio");
    expect(captured!.get("To")).toBe("+919876543210");
    expect(captured!.get("From")).toBe("+15005550006");
    expect(auth).toBe(`Basic ${Buffer.from("ACtest123:token123").toString("base64")}`);
    const code = captured!.get("Body")!.match(/\b(\d{6})\b/)![1];
    expect(captured!.get("Body")).toContain("Asha");
    const v = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code });
    expect(v.status).toBe(201);
  });
  it("fails safely (502, no usable code) when Twilio rejects the message", async () => {
    twilioOnly(() => new Response(JSON.stringify({ message: "Unverified number" }), { status: 400 }));
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.status).toBe(502); expect(o.body.error).toBe("sms_failed");
    expect(JSON.stringify(o.body)).not.toMatch(/\d{6}/);
    const a = await request(app).get(api("/audit")).set(p.auth);
    expect(a.body.entries.some((e: any) => e.action === "otp_delivery_failed")).toBe(true);
  });
});
