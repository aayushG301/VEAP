import { beforeAll, describe, expect, it } from "vitest";
import { api, app, col, patientWithQr, request, tier2, FULL_PROFILE } from "./helpers";
import { env } from "../src/config/env";
import { seedRegistry, DEMO_STAFF } from "../src/demo/registry";
import { decideBreakGlass } from "../src/modules/access/breakglass.service";

const DR = DEMO_STAFF[0];          // active, Delhi
const NURSE = DEMO_STAFF[2];       // active, Meerut
const REVOKED = DEMO_STAFF[3];     // licence revoked
const LKO = DEMO_STAFF[4];         // belongs to a suspended hospital
const REASON = "Patient collapsed and is unresponsive at the bus station";

const EXTRA = {
  prescriptions: [{ drug: "Warfarin", dose: "5 mg", frequency: "daily", prescriber: "Dr Rao" }],
  allergyDetails: [{ allergen: "Penicillin", reaction: "Hives", severity: "severe" }],
  surgeries: [{ procedure: "Appendectomy", year: "2009", hospital: "District Hospital" }],
  vaccinations: [{ name: "Tetanus", date: "2024-02-10" }],
  implantDetails: [{ device: "Pacemaker", implantedYear: "2021", mriSafety: "conditional" }],
  advanceDirectives: { dnr: "no", transfusion: "accepts", otherWishes: "Call my brother first" },
  preferredHospital: { name: "City Hospital", phone: "+91 121 000 0000" },
  specialists: [{ name: "Dr Rao", specialty: "Cardiologist", phone: "+91 80000 11111" }],
  insuranceDetails: { provider: "Star Health", policyNumber: "POL-1", tpaHelpline: "1800-000-000" },
};

beforeAll(async () => { await seedRegistry(); });

async function setup(extra = true) {
  const p = await patientWithQr();
  if (extra) { const r = await request(app).put(api("/profile")).set(p.auth).send({ ...FULL_PROFILE, ...EXTRA, confirmCurrent: true }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); }
  const t = await tier2(p.qrToken);
  return { ...p, session: t.session };
}
const bgBody = (p: any, s: (typeof DEMO_STAFF)[number], over: any = {}) => ({ token: p.qrToken, hospitalId: s.hospitalId, staffId: s.staffId, pin: s.pin, reason: REASON, ...over });
const post = (p: any, body: any) => request(app).post(api("/access/break-glass")).set("X-Access-Session", p.session).send(body);
const poll = (p: any, id: string) => request(app).get(api(`/access/break-glass/${id}`)).set("X-Access-Session", p.session);

describe("Level 3: authenticated hospital override", () => {
  it("requires a verified Level 2 session, a well-formed PIN and a real reason", async () => {
    const p = await setup();
    expect((await request(app).post(api("/access/break-glass")).send(bgBody(p, DR))).status).toBe(401);
    expect((await post(p, bgBody(p, DR, { pin: "12" }))).status).toBe(400);
    expect((await post(p, bgBody(p, DR, { reason: "short" }))).status).toBe(400);
    expect((await post(p, { token: p.qrToken, reason: REASON })).status).toBe(400); // the old "just type a reason" request no longer works
  });

  it("rejects unknown IDs, wrong PINs, revoked staff and suspended hospitals with one identical message", async () => {
    const p = await setup();
    const attempts = [
      bgBody(p, DR, { pin: "000000" }),
      bgBody(p, DR, { staffId: "NMC-XX-00000" }),
      bgBody(p, DR, { hospitalId: "HSP-MRT-0002" }),   // right staff, wrong hospital
      bgBody(p, REVOKED),
      bgBody(p, LKO),
    ];
    const res: any[] = [];
    for (const a of attempts) res.push(await post(p, a));
    for (const r of res as any[]) { expect(r.status).toBe(401); expect(r.body.error).toBe("verification_failed"); }
    expect(new Set(res.map((r) => r.body.message)).size).toBe(1);
    expect(await col.breakGlass.countDocuments({})).toBe(0);
    expect(await col.securityEvents.countDocuments({ kind: "staff_verification_failed" })).toBeGreaterThanOrEqual(4);
  });

  it("locks a staff ID after repeated wrong PINs, even for the right PIN", async () => {
    const p = await setup(false);
    for (let i = 0; i < env.breakGlass.pinMaxFailures; i++) expect((await post(p, bgBody(p, NURSE, { pin: "000000" }))).status).toBe(401);
    const locked = await post(p, bgBody(p, NURSE));
    expect(locked.status).toBe(423); expect(locked.body.error).toBe("staff_locked");
  });

  it("stores PINs hashed, never in plaintext", async () => {
    const row = await col.staff.findOne({ _id: DR.staffId });
    expect(JSON.stringify(row)).not.toContain(DR.pin);
    expect(row!.pinHash).toMatch(/^\$argon2id\$/);
  });

  it("grants Level 3 after the delay, shows the full record with the responder identity, and audits everything", async () => {
    env.breakGlass.delaySec = 0;
    const p = await setup();
    const r = await post(p, bgBody(p, DR));
    expect(r.status).toBe(202); expect(r.body.status).toBe("pending");
    expect(r.body.responder.name).toBe(DR.name);
    const g = await poll(p, r.body.requestId);
    expect(g.body.status).toBe("auto_granted"); expect(g.body.tier).toBe(3); expect(g.body.sessionToken).toBeTruthy();
    const rec = await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", g.body.sessionToken);
    expect(rec.status).toBe(200);
    expect(rec.body.data.notes).toBe("SECRET-NOTES-TIER3");
    expect(rec.body.data.surgeries[0].procedure).toBe("Appendectomy");
    expect(rec.body.data.advanceDirectives.dnr).toBe("no");
    expect(rec.body.data.implantDetails[0].mriSafety).toBe("conditional");
    expect(rec.body.responder).toMatchObject({ staffId: DR.staffId, name: DR.name, hospitalName: expect.stringContaining("AIIMS") });
    expect(rec.body.profileUpdatedAt).toBeGreaterThan(0);
    const again = await poll(p, r.body.requestId);                    // idempotent: same session, no second grant
    expect(again.body.sessionToken).toBeTruthy();
    expect(await col.accessSessions.countDocuments({ userId: p.user.id, tier: 3 })).toBe(1);
    const n = await request(app).get(api("/notifications")).set(p.auth);
    expect(n.body.notifications.some((x: any) => x.severity === "critical" && /BREAK-GLASS/.test(x.title) && x.body.includes(DR.staffId))).toBe(true);
    const a = await request(app).get(api("/audit")).set(p.auth);
    const actions = a.body.entries.map((x: any) => x.action);
    for (const x of ["break_glass_requested", "break_glass_auto_granted", "break_glass"]) expect(actions).toContain(x);
    const verify = await request(app).get(api("/audit/verify")).set(p.auth);
    expect(verify.body.valid).toBe(true);
  });

  it("waits while pending, and the emergency contact can deny or approve it", async () => {
    env.breakGlass.delaySec = 3600;
    const p = await setup();
    await col.telegramLinks.insertOne({ _id: "link-1", userId: p.user.id, chatId: "555", chatName: "Ravi", linkedAt: Date.now() });
    const r = await post(p, bgBody(p, DR));
    expect(r.status).toBe(202);
    const pending = await poll(p, r.body.requestId);
    expect(pending.body.status).toBe("pending"); expect(pending.body.secondsLeft).toBeGreaterThan(3000); expect(pending.body.sessionToken).toBeUndefined();
    expect((await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", p.session)).body.data.notes).toBeUndefined(); // still only Level 2

    expect(await decideBreakGlass(r.body.requestId, "approved", "999")).toMatch(/not an emergency contact/); // wrong chat cannot decide
    expect(await decideBreakGlass(r.body.requestId, "denied", "555")).toMatch(/Denied/);
    expect((await poll(p, r.body.requestId)).body).toEqual({ status: "denied" });
    expect(await decideBreakGlass(r.body.requestId, "approved", "555")).toMatch(/already denied/);

    const r2 = await post(p, bgBody(p, DR));
    expect(await decideBreakGlass(r2.body.requestId, "approved", "555")).toMatch(/Approved/);
    const ok = await poll(p, r2.body.requestId);
    expect(ok.body.status).toBe("approved"); expect(ok.body.sessionToken).toBeTruthy();
  });

  it("limits overrides per staff member per day and keeps requests private to their QR", async () => {
    env.breakGlass.delaySec = 0; env.breakGlass.maxPerStaffPerDay = 2;
    const a = await setup(false), b = await setup(false);
    const other = { ...DR, staffId: "NMC-UP-30517", hospitalId: "HSP-MRT-0002", pin: "305172" } as any;
    const r1 = await post(a, bgBody(a, other));
    expect(r1.status).toBe(202);
    await poll(a, r1.body.requestId);
    expect((await post(b, bgBody(b, other))).status).toBe(202);
    const third = await post(a, bgBody(a, other));
    expect(third.status).toBe(429); expect(third.body.error).toBe("override_limit");
    expect((await poll(b, r1.body.requestId)).status).toBe(404); // another patient's session cannot read it
    env.breakGlass.maxPerStaffPerDay = 3;
  });
});

describe("New clinical fields", () => {
  it("are encrypted, validated, and released only at their visibility level", async () => {
    env.breakGlass.delaySec = 0;
    const p = await setup();
    const row = await col.profiles.findOne({ _id: p.user.id });
    for (const s of ["Appendectomy", "Warfarin", "Star Health", "Call my brother"]) expect(JSON.stringify(row!.fieldsEnc)).not.toContain(s);
    const t2 = await request(app).get(api(`/emergency/${p.qrToken}/record`)).set("X-Access-Session", p.session);
    expect(t2.body.data.prescriptions[0].drug).toBe("Warfarin");           // Level 2
    expect(t2.body.data.allergyDetails[0].severity).toBe("severe");        // Level 2
    expect(t2.body.data.lastVerifiedAt).toBeTruthy();                      // Level 2
    for (const k of ["surgeries", "vaccinations", "implantDetails", "advanceDirectives", "specialists", "insuranceDetails", "preferredHospital"]) expect(t2.body.data[k]).toBeUndefined(); // Level 3 only
    const pub = await request(app).get(api(`/emergency/${p.qrToken}`));
    expect(JSON.stringify(pub.body.data)).not.toMatch(/Warfarin|Appendectomy|Star Health/);
    const bad = await request(app).put(api("/profile")).set(p.auth).send({ ...FULL_PROFILE, implantDetails: [{ device: "x", mriSafety: "maybe" }] });
    expect(bad.status).toBe(400);
  });

  it("stamps 'last verified' with the server clock and keeps it when the patient saves again", async () => {
    const p = await patientWithQr();
    const forged = await request(app).put(api("/profile")).set(p.auth).send({ ...FULL_PROFILE, lastVerifiedAt: "2001-01-01" });
    expect(forged.body.profile.lastVerifiedAt).toBeUndefined();            // cannot be forged without confirmCurrent
    const first = await request(app).put(api("/profile")).set(p.auth).send({ ...FULL_PROFILE, confirmCurrent: true });
    const stamp = first.body.profile.lastVerifiedAt;
    expect(Date.now() - Date.parse(stamp)).toBeLessThan(10_000);
    const second = await request(app).put(api("/profile")).set(p.auth).send({ ...FULL_PROFILE, notes: "edited" });
    expect(second.body.profile.lastVerifiedAt).toBe(stamp);
  });
});
