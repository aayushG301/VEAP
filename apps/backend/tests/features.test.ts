import { describe, expect, it } from "vitest";
import { api, app, col, patientWithQr, PW, registerPatient, request, tier2 } from "./helpers";
import { authenticator } from "otplib";

describe("OTP delivery target", () => {
  it("sends the code to the patient's emergency contact (mock mode shows it for demos)", async () => {
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.body.sentTo).toBe("emergency_contact");
    expect(o.body.contactName).toBe("Ravi Verma");
    expect(o.body.maskedTarget).toMatch(/3210$/);
    expect(o.body.maskedTarget).not.toContain("98765");
    expect(o.body.devOtp).toMatch(/^\d{6}$/);
    const a = await request(app).get(api("/audit")).set(p.auth);
    expect(a.body.entries.find((e: any) => e.action === "otp_requested").meta.sentTo).toBe("emergency_contact");
  });
  it("falls back to the responder's phone when the patient has no contact, and flags it", async () => {
    const p = await registerPatient();
    await request(app).put(api("/profile")).set(p.auth).send({ fullName: "No Contact", bloodGroup: "A+" });
    const qr = await request(app).post(api("/qr")).set(p.auth);
    const token = qr.body.token.url.split("/e/")[1];
    const o = await request(app).post(api("/access/otp/request")).send({ token, phone: "+91 90000 12345" });
    expect(o.body.sentTo).toBe("responder");
    const a = await request(app).get(api("/audit")).set(p.auth);
    expect(a.body.entries.find((e: any) => e.action === "otp_requested").meta.sentTo).toBe("responder");
  });
});

describe("report misuse", () => {
  it("alerts the owner, logs a security event, and works on locked codes", async () => {
    const p = await patientWithQr();
    const r = await request(app).post(api(`/emergency/${p.qrToken}/report`)).send({ reason: "Stranger photographing the card" });
    expect(r.status).toBe(201);
    const n = await request(app).get(api("/notifications")).set(p.auth);
    expect(n.body.notifications.some((x: any) => /Misuse reported/.test(x.title) && /photographing/.test(x.body))).toBe(true);
    expect(await col.securityEvents.countDocuments({ kind: "misuse_report" })).toBeGreaterThan(0);
    await col.qrTokens.updateOne({ _id: p.tokenId }, { $set: { status: "locked" } });
    expect((await request(app).post(api(`/emergency/${p.qrToken}/report`)).send({})).status).toBe(201);
    expect((await request(app).post(api("/emergency/not-a-real-token-at-all-xyz/report")).send({})).status).toBe(404);
  });
});

describe("account deletion (right to erasure)", () => {
  it("requires the password, then erases everything linked to the account", async () => {
    const p = await patientWithQr();
    await tier2(p.qrToken);
    expect((await request(app).delete(api("/auth/account")).set(p.auth).send({ password: "WrongPassw0rd!x" })).status).toBe(401);
    const del = await request(app).delete(api("/auth/account")).set(p.auth).send({ password: PW });
    expect(del.status).toBe(200);
    expect((await request(app).get(api(`/emergency/${p.qrToken}`))).status).toBe(404);
    expect((await request(app).post(api("/auth/login")).send({ email: p.email, password: PW })).status).toBe(401);
    for (const c of ["users", "profiles", "userKeys", "qrTokens", "sessions", "audit", "notifications", "accessSessions"] as const) {
      expect(await (col[c] as any).countDocuments(c === "users" || c === "profiles" || c === "userKeys" ? { _id: p.user.id } : { userId: p.user.id })).toBe(0);
    }
  });
  it("needs a valid authenticator code when 2FA is on", async () => {
    const p = await registerPatient();
    const s = await request(app).post(api("/auth/mfa/setup")).set(p.auth);
    await request(app).post(api("/auth/mfa/enable")).set(p.auth).send({ code: authenticator.generate(s.body.secret) });
    expect((await request(app).delete(api("/auth/account")).set(p.auth).send({ password: PW })).status).toBe(401);
    expect((await request(app).delete(api("/auth/account")).set(p.auth).send({ password: PW, code: authenticator.generate(s.body.secret) })).status).toBe(200);
  });
});
