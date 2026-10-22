import { describe, expect, it } from "vitest";
import { api, app, col, patientWithQr, registerPatient, request, tier2, PW, uniqueEmail } from "./helpers";

describe("Tier 1: public scan", () => {
  it("exposes only Tier 1 fields and nothing sensitive", async () => {
    const p = await patientWithQr();
    const r = await request(app).get(api(`/emergency/${p.qrToken}`));
    expect(r.status).toBe(200);
    expect(r.body.tier).toBe(1);
    expect(r.body.data.bloodGroup).toBe("O-");
    expect(r.body.data.allergies).toEqual(["Penicillin"]);
    expect(r.body.data.emergencyContacts[0].name).toBe("Ravi Verma");
    expect(r.body.data.emergencyInstructions).toMatch(/EpiPen/);
    const raw = JSON.stringify(r.body);
    for (const secret of ["Warfarin", "Pacemaker", "diabetes", "SECRET-NOTES-TIER3", "POLICY-12345", "1990-04-02"]) expect(raw).not.toContain(secret);
  });
  it("forged, garbled and unknown tokens all look the same (404) and are logged", async () => {
    const p = await patientWithQr();
    const id = p.qrToken.split(".")[0];
    const forged = await request(app).get(api(`/emergency/${id}.deadbeefdeadbeefdead`));
    const garbage = await request(app).get(api("/emergency/not-a-token"));
    expect(forged.status).toBe(404); expect(garbage.status).toBe(404);
    expect(forged.body).toEqual(garbage.body);
    expect(await col.securityEvents.countDocuments({ kind: "invalid_token_signature" })).toBeGreaterThan(0);
  });
  it("honeytoken probes are recorded as security events", async () => {
    const { createQrToken } = await import("../src/security/tokens");
    const h = createQrToken();
    await col.honeytokens.insertOne({ tokenHash: h.tokenHash, createdAt: Date.now() });
    expect((await request(app).get(api(`/emergency/${h.token}`))).status).toBe(404);
    expect(await col.securityEvents.countDocuments({ kind: "honeytoken_probe" })).toBe(1);
  });
  it("notifies the owner of every scan", async () => {
    const p = await patientWithQr();
    await request(app).get(api(`/emergency/${p.qrToken}?lat=12.9716&lng=77.5946`));
    const n = await request(app).get(api("/notifications")).set(p.auth);
    expect(n.body.notifications.some((x: any) => x.type === "scan")).toBe(true);
    const a = await request(app).get(api("/audit")).set(p.auth);
    expect(a.body.entries.find((e: any) => e.action === "scan").geo).toBe("12.9716,77.5946");
  });
  it("owner field visibility overrides are respected", async () => {
    const p = await patientWithQr();
    await request(app).put(api("/profile/visibility")).set(p.auth).send({ visibility: { medications: 1, allergies: 3 } });
    const r = await request(app).get(api(`/emergency/${p.qrToken}`));
    expect(r.body.data.medications).toBeTruthy();
    expect(r.body.data.allergies).toBeUndefined();
  });
});

describe("Tier 2: OTP", () => {
  it("record endpoint needs a session; OTP unlocks Tier 2 only", async () => {
    const p = await patientWithQr();
    expect((await request(app).get(api(`/emergency/${p.qrToken}/record`))).status).toBe(401);
    const t = await tier2(p.qrToken);
    expect(t.res.status).toBe(201);
    const rec = await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", t.session);
    expect(rec.status).toBe(200); expect(rec.body.tier).toBe(2);
    expect(rec.body.data.medications).toContain("Warfarin 5mg");
    expect(rec.body.data.conditions).toContain("Asthma");
    const raw = JSON.stringify(rec.body.data);
    expect(raw).not.toContain("SECRET-NOTES-TIER3"); expect(raw).not.toContain("POLICY-12345");
  });
  it("flags drug-allergy and drug-drug conflicts for responders", async () => {
    const p = await patientWithQr();
    const t = await tier2(p.qrToken);
    const rec = await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", t.session);
    const msgs = rec.body.warnings.map((w: any) => w.message).join(" | ");
    expect(msgs).toMatch(/Penicillin-class allergy/i);
    expect(msgs).toMatch(/Anticoagulant plus NSAID/i);
  });
  it("wrong OTP fails, 3 failures lock the OTP, and OTPs are single use", async () => {
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    const wrong = o.body.devOtp === "000000" ? "111111" : "000000";
    const bad = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code: wrong });
    expect(bad.status).toBe(401); expect(bad.body.attemptsLeft).toBe(2);
    await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code: wrong });
    await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code: wrong });
    const locked = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code: o.body.devOtp });
    expect(locked.status).toBe(429);
    const t = await tier2(p.qrToken);
    const reuse = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: t.otp.otpId, code: t.otp.devOtp });
    expect(reuse.status).toBe(400);
  });
  it("OTPs are stored hashed, never in plaintext", async () => {
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    const row: any = await col.otps.findOne({ _id: o.body.otpId });
    expect(JSON.stringify(row)).not.toContain(o.body.devOtp);
    expect(JSON.stringify(row)).not.toContain("9000012345");
  });
  it("limits OTP requests per profile", async () => {
    const p = await patientWithQr();
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" })).status;
    expect(last).toBe(429);
  });
  it("sessions expire server-side and cannot be used on another profile", async () => {
    const p = await patientWithQr(); const other = await patientWithQr();
    const t = await tier2(p.qrToken);
    expect((await request(app).get(api(`/emergency/${other.qrToken}/record`)).set("X-Access-Session", t.session)).status).toBe(403);
    await col.accessSessions.updateMany({ tokenId: p.tokenId }, { $set: { expiresAt: Date.now() - 1000 } });
    const r = await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", t.session);
    expect(r.status).toBe(401); expect(r.body.error).toBe("session_expired");
  });
  it("a session can be extended once and ended explicitly", async () => {
    const p = await patientWithQr(); const t = await tier2(p.qrToken);
    expect((await request(app).post(api("/access/extend")).set("X-Access-Session", t.session)).status).toBe(200);
    expect((await request(app).post(api("/access/extend")).set("X-Access-Session", t.session)).status).toBe(409);
    expect((await request(app).post(api("/access/end")).set("X-Access-Session", t.session)).status).toBe(200);
    expect((await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", t.session)).status).toBe(401);
  });
});

describe("Tier 3: professional credentials", () => {
  it("licensed professionals get Tier 3 only after admin approval", async () => {
    const p = await patientWithQr();
    const agent = request.agent(app);
    const email = uniqueEmail("doc");
    const reg = await agent.post(api("/auth/register-responder")).send({ email, password: PW, name: "Dr Meera", licenseNo: "MCI-998877", licenseIssuer: "Medical Council" });
    expect(reg.body.user.responderStatus).toBe("pending");
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    expect((await request(app).post(api("/access/credential")).set(auth).send({ token: p.qrToken })).status).toBe(403);
    // admin approves
    const docHash = (await col.users.findOne({ _id: reg.body.user.id }))!.passwordHash;
    await col.users.insertOne({ _id: "admin-1", email: "admin@test.dev", name: "Admin", passwordHash: docHash, role: "admin", mfaEnabled: false, recoveryHashes: [], failedLogins: 0, lockedUntil: 0, responderStatus: null, createdAt: Date.now() });
    const adminLogin = await request(app).post(api("/auth/login")).send({ email: "admin@test.dev", password: PW });
    const adm = { Authorization: `Bearer ${adminLogin.body.accessToken}` };
    expect((await request(app).get(api("/admin/responders")).set(auth)).status).toBe(403);
    expect((await request(app).post(api(`/admin/responders/${reg.body.user.id}/approve`)).set(adm)).status).toBe(200);
    const relogin = await request(app).post(api("/auth/login")).send({ email, password: PW });
    const cred = await request(app).post(api("/access/credential")).set({ Authorization: `Bearer ${relogin.body.accessToken}` }).send({ token: p.qrToken });
    expect(cred.status).toBe(201); expect(cred.body.tier).toBe(3);
  });
  it("patients cannot use admin or responder routes", async () => {
    const p = await registerPatient();
    expect((await request(app).get(api("/admin/stats")).set(p.auth)).status).toBe(403);
  });
});

describe("Token lifecycle & abuse defense", () => {
  it("revoking a QR kills the QR and every live session", async () => {
    const p = await patientWithQr(); const t = await tier2(p.qrToken);
    expect((await request(app).post(api(`/qr/${p.tokenId}/revoke`)).set(p.auth)).status).toBe(200);
    expect((await request(app).get(api(`/emergency/${p.qrToken}`))).status).toBe(410);
    expect((await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", t.session)).status).toBe(410);
  });
  it("regenerating revokes the previous QR", async () => {
    const p = await patientWithQr();
    const n = await request(app).post(api("/qr")).set(p.auth);
    expect(n.body.token.url).not.toContain(p.qrToken);
    expect((await request(app).get(api(`/emergency/${p.qrToken}`))).status).toBe(410);
    expect((await request(app).get(api(`/emergency/${n.body.token.url.split("/e/")[1]}`))).status).toBe(200);
  });
  it("auto-locks a token under scraping behaviour and the owner can unlock it", async () => {
    const p = await patientWithQr();
    const now = Date.now();
    await col.scanEvents.insertMany(Array.from({ length: 40 }, (_, i) => ({ tokenId: p.tokenId, ip: `10.0.0.${i % 9}`, ua: "bot", ts: now - i * 1000, at: new Date(now - i * 1000) })));
    const r = await request(app).get(api(`/emergency/${p.qrToken}`));
    expect(r.status).toBe(423); expect(r.body.error).toBe("token_locked");
    const n = await request(app).get(api("/notifications")).set(p.auth);
    expect(n.body.notifications.some((x: any) => /locked/i.test(x.title))).toBe(true);
    await col.scanEvents.deleteMany({ tokenId: p.tokenId });
    expect((await request(app).post(api(`/qr/${p.tokenId}/unlock`)).set(p.auth)).status).toBe(200);
    expect((await request(app).get(api(`/emergency/${p.qrToken}`))).status).toBe(200);
  });
  it("QR tokens are stored hashed + encrypted, never in plaintext", async () => {
    const p = await patientWithQr();
    const row: any = await col.qrTokens.findOne({ _id: p.tokenId });
    expect(JSON.stringify(row)).not.toContain(p.qrToken.split(".")[0]);
  });
  it("profile data is encrypted at rest (field-level)", async () => {
    const p = await patientWithQr();
    const row: any = await col.profiles.findOne({ _id: p.user.id });
    for (const s of ["Penicillin", "Warfarin", "SECRET-NOTES", "Ravi Verma", "Asha"]) expect(JSON.stringify(row.fieldsEnc)).not.toContain(s);
  });
  it("rejects malformed input safely", async () => {
    const p = await registerPatient();
    expect((await request(app).put(api("/profile")).set(p.auth).send({ fullName: "", bloodGroup: "Z+" })).status).toBe(400);
    expect((await request(app).put(api("/profile")).set(p.auth).send({ fullName: "x", emergencyContacts: [{ name: "a", phone: "<script>" }] })).status).toBe(400);
    expect((await request(app).post(api("/auth/login")).set("Content-Type", "application/json").send("{bad")).status).toBe(400);
  });
});

describe("Assistant", () => {
  it("personalizes first aid with allowed fields only", async () => {
    const p = await patientWithQr();
    const t1 = await request(app).post(api("/assistant/guide")).send({ token: p.qrToken, scenario: "he has chest pain and is sweating" });
    expect(t1.body.title).toMatch(/heart attack/i); expect(t1.body.disclaimer).toMatch(/emergency number/i);
    expect(t1.body.warnings.join(" ")).not.toMatch(/blood thinner/i); // meds are Tier 2 data
    const t = await tier2(p.qrToken);
    const t2 = await request(app).post(api("/assistant/guide")).set("X-Access-Session", t.session).send({ token: p.qrToken, scenario: "he has chest pain and is sweating" });
    expect(t2.body.warnings.join(" ")).toMatch(/blood thinner/i);
    expect(t2.body.warnings.join(" ")).toMatch(/NSAID|aspirin/i);
  });
  it("triage classifies critical vs low", async () => {
    const hi = await request(app).post(api("/assistant/triage")).send({ symptoms: ["unconscious"], age: 60 });
    expect(hi.body.level).toBe("CRITICAL");
    const lo = await request(app).post(api("/assistant/triage")).send({ symptoms: ["fever"], age: 25 });
    expect(lo.body.level).toBe("LOW");
  });
});
