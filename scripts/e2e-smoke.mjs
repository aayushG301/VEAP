/* End-to-end smoke test against a RUNNING stack (backend + ML service, optionally through the frontend proxy).
   Usage: BASE=http://localhost:5173 node scripts/e2e-smoke.mjs   (defaults to http://localhost:4000) */
const BASE = (process.env.BASE || "http://localhost:4000") + "/api/v1";
const ADMIN = { email: process.env.ADMIN_EMAIL || "root@veap.dev", password: process.env.ADMIN_PASSWORD || "RootPassw0rd!" };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };
const call = async (path, { method, body, token, session, cookie, headers = {} } = {}) => {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (token) h.authorization = `Bearer ${token}`;
  if (session) h["x-access-session"] = session;
  if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + path, { method: method || (body !== undefined ? "POST" : "GET"), headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { s: r.status, j, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
};
const stamp = Date.now();
const PW = "Str0ngPassw0rd!";

const reg = await call("/auth/register", { body: { email: `e2e${stamp}@test.dev`, password: PW, name: "E2E Patient" } });
ok(reg.s === 201 && reg.j.accessToken, "patient registers");
const T = reg.j.accessToken;
const prof = await call("/profile", { method: "PUT", token: T, body: { fullName: "Asha Verma", bloodGroup: "O-", allergies: ["Penicillin", "Aspirin"], conditions: ["Type 2 diabetes"], medications: ["Warfarin 5mg", "Amoxicillin", "Ibuprofen"], organDonor: true, emergencyContacts: [{ name: "Ravi", phone: "+91 98765 43210", relationship: "Brother" }], notes: "TIER3-ONLY" } });
ok(prof.s === 200 && prof.j.completeness > 40, `profile saved (completeness ${prof.j.completeness}%)`);
const qr = await call("/qr", { method: "POST", token: T, body: {} });
const url = qr.j.token.url; const token = url.split("/e/")[1];
ok(qr.s === 201 && qr.j.token.dataUrl.startsWith("data:image/png"), "QR generated (signed token, PNG data URL)");

const scan = await call(`/emergency/${token}`);
ok(scan.s === 200 && scan.j.data.bloodGroup === "O-" && !JSON.stringify(scan.j).includes("Warfarin"), "Tier 1 scan exposes only public fields");
ok(["ml", "rule-based"].includes(scan.j.risk.source), `scan risk scored by: ${scan.j.risk.source}`);

const o = await call("/access/otp/request", { body: { token, phone: "+91 90000 12345" } });
const v = await call("/access/otp/verify", { body: { token, otpId: o.j.otpId, code: o.j.devOtp } });
ok(v.s === 201 && v.j.tier === 2, "OTP verified -> Tier 2 session");
const rec = await call(`/emergency/${token}/record`, { session: v.j.sessionToken });
ok(rec.s === 200 && rec.j.data.medications.includes("Warfarin 5mg") && !rec.j.data.notes, "Tier 2 record: medications yes, Tier 3 notes no");
ok(rec.j.warnings.length >= 2, `interaction warnings (${rec.j.warningsSource}): ${rec.j.warnings.map((w) => w.level).join(",")}`);

const g = await call("/assistant/guide", { session: v.j.sessionToken, body: { token, scenario: "he has crushing chest pain" } });
ok(g.s === 200 && /heart attack/i.test(g.j.title) && g.j.warnings.some((w) => /NSAID|aspirin/i.test(w)), `assistant personalised (${g.j.source})`);
const tri = await call("/assistant/triage", { body: { symptoms: ["chest_pain", "breathing_difficulty"], age: 64, spo2: 88 } });
ok(["HIGH", "CRITICAL"].includes(tri.j.level), `triage ${tri.j.level} (${tri.j.source})`);

// Level 3: hospital staff sign-in against the (simulated) registry. Needs `npm run seed` and BREAK_GLASS_DELAY_SEC small (e.g. 2).
const bad = await call("/access/break-glass", { session: v.j.sessionToken, body: { token, hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-48213", pin: "000000", reason: "Collapsed at bus stop, unresponsive" } });
ok(bad.s === 401 && bad.j.error === "verification_failed", "override refused for a wrong staff PIN");
const bg = await call("/access/break-glass", { session: v.j.sessionToken, body: { token, hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-48213", pin: "482913", reason: "Collapsed at bus stop, unresponsive" } });
ok(bg.s === 202 && bg.j.responder?.name === "Dr. Ananya Rao", "override accepted for a registered doctor (pending contact decision)");
let grant = null;
for (let i = 0; i < 30 && !grant; i++) { const p = await call(`/access/break-glass/${bg.j.requestId}`, { session: v.j.sessionToken }); if (p.j.sessionToken) grant = p.j; else await new Promise((r) => setTimeout(r, 1000)); }
const full = await call(`/emergency/${token}/record`, { session: grant?.sessionToken });
ok(!!grant && full.j.data.notes === "TIER3-ONLY" && full.j.responder?.staffId === "NMC-DL-48213", "break-glass opens Tier 3 with the responder identity attached");
const notes = await call("/notifications", { token: T });
ok(notes.j.notifications.some((n) => n.severity === "critical"), "owner received critical break-glass alert");
const ver = await call("/audit/verify", { token: T });
ok(ver.j.valid === true && ver.j.count >= 8, `audit chain verified (${ver.j.count} entries)`);

// scraping burst: velocity must raise the risk score
let maxRisk = 0, locked = false;
for (let i = 0; i < 25; i++) { const r = await call(`/emergency/${token}`); if (r.s === 423) { locked = true; break; } if (r.s === 200) maxRisk = Math.max(maxRisk, ({ low: 0, medium: 1, high: 2 })[r.j.risk.level]); }
ok(maxRisk >= 1 || locked, `rapid scan burst raised risk (max level ${maxRisk}, locked=${locked})`);

// session lifecycle
const login = await call("/auth/login", { body: { email: `e2e${stamp}@test.dev`, password: PW } });
const rt = login.cookie;
ok(rt.startsWith("veap_rt="), "login sets refresh cookie");
const r1 = await call("/auth/refresh", { method: "POST", cookie: rt, headers: { "x-requested-with": "veap" } });
const replay = await call("/auth/refresh", { method: "POST", cookie: rt, headers: { "x-requested-with": "veap" } });
ok(r1.s === 200 && replay.s === 401 && replay.j.error === "refresh_reuse", "refresh rotates; replay is detected and blocked");

// responder approval
const doc = await call("/auth/register-responder", { body: { email: `doc${stamp}@test.dev`, password: PW, name: "Dr E2E", licenseNo: "LIC-12345", licenseIssuer: "Council" } });
const adm = await call("/auth/login", { body: ADMIN });
if (adm.j.accessToken) {
  const ap = await call(`/admin/responders/${doc.j.user.id}/approve`, { method: "POST", token: adm.j.accessToken, body: {} });
  const dl = await call("/auth/login", { body: { email: `doc${stamp}@test.dev`, password: PW } });
  const fresh = await call("/qr", { method: "POST", token: T, body: {} });
  const cred = await call("/access/credential", { token: dl.j.accessToken, body: { token: fresh.j.token.url.split("/e/")[1] } });
  ok(ap.s === 200 && cred.s === 201 && cred.j.tier === 3, "admin approves responder -> verified professional gets Tier 3");
  const evs = await call("/admin/security-events", { token: adm.j.accessToken });
  ok(evs.s === 200, "admin security-events endpoint works");
} else ok(false, "admin login failed (set ADMIN_EMAIL/ADMIN_PASSWORD)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
