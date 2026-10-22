/* Real-browser end-to-end test of the VEAP UI (Chrome/Edge via puppeteer-core).
   Needs the whole stack running (MongoDB, ML service, backend, frontend).
   Usage:  BASE=http://localhost:5173 node scripts/ui-e2e.mjs
   Optional env: CHROME_PATH (auto-detected on Windows/macOS/Linux), SHOTS_DIR (save screenshots), CHROME_ARGS,
                 ADMIN_EMAIL / ADMIN_PASSWORD (enables the responder-approval steps), HEADFUL=1 */
import puppeteer from "puppeteer-core";
import crypto from "node:crypto";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const SHOTS = process.env.SHOTS_DIR;
const ADMIN = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD ? { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } : null;
const PW = "Str0ngPassw0rd!";
const stamp = Date.now();
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const c = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  return c.find((p) => fs.existsSync(p));
}
const exe = findChrome();
if (!exe) { console.error("No Chrome/Edge found. Set CHROME_PATH to its executable."); process.exit(2); }

let pass = 0, fail = 0;
const launch = () => puppeteer.launch({ executablePath: exe, headless: process.env.HEADFUL ? false : "shell", args: ["--no-sandbox", ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(" ").filter(Boolean) : [])] });
const browser = await launch();
const extra = [];
// Isolated "browser profiles" (stranger vs patient). Real Chrome/Edge: incognito-style contexts. SEPARATE_BROWSERS=1 launches a
// separate browser process per context (needed for minimal headless builds that cannot open several contexts).
async function newCtx() {
  if (!process.env.SEPARATE_BROWSERS) return browser.createBrowserContext();
  const b = await launch(); extra.push(b);
  return { newPage: () => b.newPage(), close: () => b.close() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 12000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const clickText = async (page, selector, label) => {
  const ok = await page.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((e) => e.innerText.trim().includes(l) && !e.disabled); if (el) { el.click(); return true; } return false; }, selector, label);
  if (!ok) throw new Error(`No enabled ${selector} containing "${label}"`);
};
// Full-page screenshot; sticky/fixed bars are made static meanwhile so they do not repeat in the middle of the image.
const shot = async (page, name) => {
  if (!SHOTS) return;
  const h = await page.addStyleTag({ content: ".navbar-wrap,.savebar{position:static!important}.session-timer,.session-timer__label,.toast-container{position:absolute!important}.tabs{position:static!important}" });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  await page.evaluate((el) => el.remove(), h);
};
async function step(name, fn, page) {
  try { await fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${String(e.message).split("\n")[0]}`); if (page) await shot(page, `FAIL-${name.replace(/\W+/g, "-").slice(0, 40)}`).catch(() => {}); }
}
const must = (c, m) => { if (!c) throw new Error(m); };
const typeInto = async (page, sel, v) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, v); };
const addTag = async (page, sel, v) => { await page.click(sel); await page.type(sel, v); await page.keyboard.press("Enter"); };

// RFC 6238 TOTP (so we can complete the authenticator-app flow without a phone)
function totp(secretB32) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const ch of secretB32.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, "0");
}

const email = `ui${stamp}@test.dev`;
const ctxPatient = await newCtx();
const p = await ctxPatient.newPage();
await p.setViewport({ width: 1200, height: 900 });
p.on("pageerror", (e) => console.log("      [pageerror]", e.message));
let qrUrl = "";

await step("landing page renders with logo, hero and CTA", async () => {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await waitText(p, "Always Ready.");
  must(await p.$("header svg[aria-label='VEAP logo']"), "logo missing in navbar");
  must(await p.$("#cta-setup"), "primary CTA missing");
  await shot(p, "01-landing");
}, p);

await step("register through the UI lands on the dashboard", async () => {
  await clickText(p, "a", "Get started");
  await p.waitForSelector("#name");
  await p.type("#name", "Asha Verma"); await p.type("#email", email); await p.type("#pw", PW);
  await waitText(p, "Excellent");
  await shot(p, "02-register");
  await clickText(p, "button", "Create account");
  await waitText(p, "Hi, Asha");
}, p);

await step("fill and save the medical profile (tags, contacts, visibility)", async () => {
  await p.waitForSelector("#fn");
  await typeInto(p, "#fn", "Asha Verma");
  await p.select("#bg", "O-");
  await addTag(p, "#allergies", "Penicillin");
  await addTag(p, "#conditions", "Type 2 diabetes");
  await addTag(p, "#medications", "Warfarin 5mg"); await addTag(p, "#medications", "Amoxicillin"); await addTag(p, "#medications", "Ibuprofen");
  await p.type("#emergencyInstructions", "I carry an EpiPen in my left pocket.");
  await p.type("#cn0", "Ravi Verma"); await p.type("#cp0", "+91 98765 43210"); await p.type("#cr0", "Brother");
  await p.type("#notes", "SECRET-NOTES-TIER3");
  must((await text(p)).includes("Unsaved changes"), "dirty indicator not shown");
  must((await text(p)).includes("What a stranger sees"), "live preview missing");
  await shot(p, "03-profile");
  await clickText(p, "button", "Save profile");
  await waitText(p, "Profile saved and encrypted");
  await waitText(p, "All changes saved");
}, p);

await step("generate the QR code and read its link", async () => {
  await p.click("#tab-qr");
  await waitText(p, "Generate my QR code");
  await clickText(p, "button", "Generate my QR code");
  await p.waitForSelector(".qr-display__code img");
  qrUrl = await p.$eval(".qr-display__url", (e) => e.textContent.trim());
  must(/\/e\/[\w-]+\.[0-9a-f]+$/.test(qrUrl), `unexpected QR url ${qrUrl}`);
  await shot(p, "04-qr");
}, p);

// ---- a stranger (separate browser profile, not logged in) scans the QR ----
const ctxStranger = await newCtx();
const s = await ctxStranger.newPage();
await s.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
s.on("pageerror", (e) => console.log("      [pageerror stranger]", e.message));

await step("Level 1: stranger sees only public info, instantly", async () => {
  await s.goto(qrUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle0" });
  await waitText(s, "Asha Verma");
  const t = await text(s);
  must(t.includes("O-") && t.includes("Penicillin") && t.includes("EpiPen") && t.includes("Call Ravi Verma"), "public info incomplete");
  for (const secret of ["Warfarin", "SECRET-NOTES", "Type 2 diabetes"]) must(!t.includes(secret), `leaked ${secret} at Level 1`);
  await shot(s, "05-emergency-level1-mobile");
}, s);

await step("AI assistant gives first-aid steps (not personalised before verification)", async () => {
  await clickText(s, "button", "Heart attack");
  await waitText(s, "Call your local emergency number immediately");
  const warn = await s.$$eval(".ai-warning", (els) => els.map((e) => e.innerText).join(" | "));
  must(!/blood thinner|warfarin/i.test(warn), "Level 2 data (blood thinner) leaked into Level 1 assistant warnings");
}, s);

await step("Level 2: code goes to the emergency contact; entering it unlocks verified data", async () => {
  await s.type("#ph", "+91 90000 12345");
  await clickText(s, "button", "Send code");
  await s.waitForSelector(".demo-banner");
  const t = await text(s);
  must(t.includes("Ravi Verma") && t.includes("3210"), "UI should say the code went to the emergency contact");
  const code = (await s.$eval(".demo-banner", (e) => e.innerText)).match(/\b(\d{6})\b/)[1];
  await shot(s, "06-otp");
  await s.click(".otp-input"); await s.keyboard.type(code);
  await waitText(s, "Verified access");
  await waitText(s, "Warfarin 5mg");
  must(await s.$(".session-timer"), "session timer bar missing");
  const t2 = await text(s);
  must(t2.includes("Penicillin-class allergy") && t2.includes("Anticoagulant plus NSAID"), "drug warnings missing");
  must(!t2.includes("SECRET-NOTES"), "Level 3 data leaked at Level 2");
  await shot(s, "07-emergency-level2-mobile");
}, s);

await step("AI assistant is now personalised with the patient's meds and allergies", async () => {
  await clickText(s, "button", "Heart attack");
  await waitText(s, "This patient:");
  const t = await text(s);
  must(/blood thinner/i.test(t) && /NSAID|aspirin/i.test(t), "personalised warnings should mention blood thinner and aspirin");
}, s);

await step("wrong OTP shows remaining attempts (fresh code, wrong digits)", async () => {
  const ctx = await newCtx(); const w = await ctx.newPage();
  await w.goto(qrUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle0" });
  await w.waitForSelector("#ph"); await w.type("#ph", "+91 90000 12345"); await clickText(w, "button", "Send code");
  await w.waitForSelector(".demo-banner");
  const real = (await w.$eval(".demo-banner", (e) => e.innerText)).match(/\b(\d{6})\b/)[1];
  const wrong = real === "000000" ? "111111" : "000000";
  await w.click(".otp-input"); await w.keyboard.type(wrong);
  await waitText(w, "Incorrect code. 2 attempts left");
  await ctx.close();
}, null);

await step("Level 3: hospital staff must sign in with registry credentials, a wrong PIN is refused, the right one unlocks everything", async () => {
  await clickText(s, "button", "Emergency override");
  await s.waitForSelector("#hid");
  must(await s.$eval(".modal__actions .btn--danger", (b) => b.disabled), "submit should be disabled with an empty form");
  const fill = async (pin) => {
    for (const sel of ["#hid", "#sid", "#pin", "#reason"]) await s.$eval(sel, (e) => { e.value = ""; });
    await s.type("#hid", "HSP-DEL-0001"); await s.type("#sid", "NMC-DL-48213"); await s.type("#pin", pin); await s.type("#reason", "Patient collapsed and is unresponsive at the station");
  };
  await fill("000000");
  await shot(s, "08-override-form");
  await clickText(s, ".modal__actions button", "Verify & request access");
  await waitText(s, "not valid");
  await fill("482913");
  await clickText(s, ".modal__actions button", "Verify & request access");
  await waitText(s, "Identity verified");
  await shot(s, "08b-override-waiting");
  await waitText(s, "SECRET-NOTES-TIER3");   // needs BREAK_GLASS_DELAY_SEC small (e.g. 2) on the running backend
  await waitText(s, "Level 3 is unlocked");
  await waitText(s, "Accessed by");
}, s);

await step("report misuse from the scan page", async () => {
  await clickText(s, "button", "Report misuse");
  await s.waitForSelector("textarea[aria-label='What happened?']");
  await s.type("textarea[aria-label='What happened?']", "Someone is photographing the card");
  await clickText(s, ".modal__actions button", "Send report");
  await waitText(s, "owner has been notified");
}, s);

await step("patient sees alerts, activity timeline and a verified audit chain", async () => {
  await p.bringToFront();
  await p.click("#tab-activity");
  await waitText(p, "BREAK-GLASS access used");
  await waitText(p, "Misuse reported");
  must(await p.$(".tab__dot"), "unread badge missing on Activity tab");
  await clickText(p, "button", "Verify log integrity");
  await waitText(p, "Integrity verified");
  await shot(p, "09-activity");
}, p);

await step("set up 2FA with an authenticator code, get recovery codes", async () => {
  await p.click("#tab-security");
  await clickText(p, "button", "Set up authenticator app");
  await p.waitForSelector("code");
  const secret = await p.$eval("code", (e) => e.textContent.trim());
  await p.type("#mc", totp(secret));
  await clickText(p, "button", "Turn on 2FA");
  await waitText(p, "Save your recovery codes");
  await shot(p, "10-security");
  await clickText(p, "button", "I've saved them");
  p.__secret = secret;
}, p);

await step("log out and log back in with email, password and the 2FA code", async () => {
  await clickText(p, "button", "Log out");
  await waitText(p, "Always Ready.");
  await clickText(p, "a", "Log in");
  await p.waitForSelector("#email");
  await p.type("#email", email); await p.type("#pw", PW);
  await clickText(p, "button", "Log in");
  await waitText(p, "Two-factor verification");
  await p.type("#code", totp(p.__secret));
  await clickText(p, "button", "Verify");
  await waitText(p, "Hi, Asha");
}, p);

await step("mobile layout: bottom tab bar and no horizontal scroll", async () => {
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.reload({ waitUntil: "networkidle0" });
  await waitText(p, "Hi, Asha");
  const r = await p.evaluate(() => { const t = document.querySelector(".tabs").getBoundingClientRect(); return { fixedBottom: Math.abs(t.bottom - innerHeight) < 2, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
  must(r.fixedBottom, "tabs should be a bottom bar on phones"); must(!r.overflow, "page scrolls horizontally on mobile");
  await shot(p, "11-dashboard-mobile");
  await p.setViewport({ width: 1200, height: 900 }); // leaving mobile emulation makes puppeteer reload the page
  await p.waitForSelector("#tab-qr", { timeout: 15000 });
}, p);

await step("revoke the QR: stranger's page now says it is revoked", async () => {
  await p.click("#tab-qr");
  await waitText(p, "Revoke");
  await clickText(p, "button", "Revoke");
  await p.waitForSelector(".modal");
  await clickText(p, ".modal__actions button", "Revoke now");
  await waitText(p, "No QR code yet");
  const ctx = await newCtx(); const w = await ctx.newPage();
  await w.goto(qrUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle0" });
  await waitText(w, "QR code revoked");
  await shot(w, "12-revoked");
  await ctx.close();
}, p);

await step("invalid QR link shows a friendly error with emergency numbers", async () => {
  const ctx = await newCtx(); const w = await ctx.newPage();
  await w.goto(`${BASE}/e/not-a-real-token-xyz-123456`, { waitUntil: "networkidle0" });
  await waitText(w, "Invalid QR code");
  must(await w.$("a[href='tel:112']"), "112 button missing");
  await ctx.close();
}, null);

if (ADMIN) {
  const doc = `doc${stamp}@test.dev`;
  const ctx = await newCtx(); const d = await ctx.newPage(); await d.setViewport({ width: 1100, height: 850 });
  await step("responder applies; admin approves in the console", async () => {
    await d.goto(`${BASE}/responder/register`, { waitUntil: "networkidle0" });
    await d.type("#n", "Dr Meera Rao"); await d.type("#e", doc); await d.type("#p", PW); await d.type("#l", "MCI-998877"); await d.type("#i", "State Medical Council");
    await clickText(d, "button", "Apply for verification");
    await waitText(d, "Awaiting verification");
    const ctxA = await newCtx(); const a = await ctxA.newPage(); await a.setViewport({ width: 1100, height: 850 });
    await a.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await a.type("#email", ADMIN.email); await a.type("#pw", ADMIN.password); await clickText(a, "button", "Log in");
    await waitText(a, "Admin console"); await waitText(a, "Dr Meera Rao");
    await shot(a, "13-admin");
    await a.evaluate(() => { const card = [...document.querySelectorAll(".card")].find((c) => c.innerText.includes("Dr Meera Rao")); [...card.querySelectorAll("button")].find((b) => b.innerText.includes("Approve")).click(); });
    await waitText(a, "Responder approved");
    await ctxA.close();
    await d.reload({ waitUntil: "networkidle0" });
    await waitText(d, "Verified professional");
  }, d);
  await ctx.close();
}

await step("delete the account permanently (password required)", async () => {
  // log in again fresh because the previous patient session is still the active one
  await p.goto(`${BASE}/dashboard?tab=security`, { waitUntil: "networkidle0" });
  await waitText(p, "Danger zone");
  await clickText(p, "button", "Delete my account");
  await p.waitForSelector("#delpw");
  await p.type("#delpw", PW);
  await p.type("#delcode", totp(p.__secret));
  await clickText(p, ".modal__actions button", "Delete forever");
  await waitText(p, "Always Ready.");
  const ctx = await newCtx(); const w = await ctx.newPage();
  await w.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await w.type("#email", email); await w.type("#pw", PW); await clickText(w, "button", "Log in");
  await waitText(w, "Invalid email or password");
  await ctx.close();
}, p);

for (const b of extra) await b.close().catch(() => {});
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
