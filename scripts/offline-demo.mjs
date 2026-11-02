/* One-command demo of VEAP's offline emergency access, for showing judges.
 *
 * It needs NO backend and NO database: it builds the frontend, serves the built app plus a tiny
 * fake Tier 1 API on a single origin, then drives a real Chrome window through the story —
 * online (live, verified) -> the connection drops -> the saved Tier 1 copy, clearly unverified.
 * It finishes in that offline view and leaves the window open, so it stays in that form: the
 * connection is never restored and the page never flips back to online on its own.
 * Screenshots are written to demo/offline-shots/.
 *
 * Usage:
 *   npm run demo:offline                 visible browser, screenshots, ~1.5s pause per step
 *   HOLD=0 npm run demo:offline          exit instead of leaving the window open
 *   HEADLESS=1 npm run demo:offline      no window (for CI)
 *   STEP_PAUSE_MS=0 npm run demo:offline skip the pauses
 *   SHOTS_DIR=out node scripts/offline-demo.mjs
 */
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "apps/frontend/dist");
const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(ROOT, "demo", "offline-shots"));
const HEADFUL = !process.env.HEADLESS;
const PAUSE = Number(process.env.STEP_PAUSE_MS ?? (HEADFUL ? 1500 : 0));

/* The QR we will scan. TOKEN was fetched while online; UNSEEN never was (first-time offline scan). */
const TOKEN = "demo.9Fk2Qw7Zx4Mv8Bn1Lc6Rd3";
const UNSEEN = "new.7Ht4Yp2Ks9Qf5Vd8Wz1Nc6";
const PROFILE_UPDATED_AT = Date.now() - 2 * 60 * 60 * 1000;

/* A stand-in for the backend's public Tier 1 response (only public fields, never Tier 2/3). */
const TIER1 = {
  tier: 1,
  profileUpdatedAt: PROFILE_UPDATED_AT,
  risk: { level: "low", source: "rule-based", score: 4, reasons: [] },
  otpMode: "demo",
  demo: null,
  data: {
    fullName: "Asha Verma",
    dateOfBirth: "1991-04-12",
    bloodGroup: "O-",
    allergies: ["Penicillin", "Peanuts"],
    conditions: ["Type 2 diabetes"],
    emergencyInstructions: "I carry an EpiPen in my left pocket — use it for a severe reaction.",
    emergencyContacts: [{ name: "Ravi Verma", phone: "+91 98765 43210", relationship: "Brother" }],
    organDonor: true,
  },
};

/* ---------------------------------------------------------------- static + fake API server */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };

function apiHandler(req, res) {
  const send = (status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/api/v1/auth/refresh") return send(401, { error: "no_refresh" });
  if (p === `/api/v1/emergency/${TOKEN}`) return send(200, TIER1);
  if (p === `/api/v1/emergency/${TOKEN}/record`) return send(401, { error: "unauthorized", message: "A verified session is required." });
  return send(404, { error: "not_found", message: "not part of this demo" });
}

function staticHandler(req, res) {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(DIST, path.normalize(p));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // A request for a real asset that is missing stays a 404; every other path is a page
    // route (e.g. /e/<token>, or the "/" the service worker pre-caches) -> the app shell.
    const looksLikeAsset = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json|map|txt|webmanifest)$/i.test((p.split("/").pop() || ""));
    if (looksLikeAsset) { res.writeHead(404); return res.end("not found"); }
    file = path.join(DIST, "index.html"); // SPA fallback so /e/:token works
  }
  const ext = path.extname(file);
  const headers = { "content-type": MIME[ext] || "application/octet-stream" };
  if (ext === ".html" || file.endsWith("sw.js")) headers["cache-control"] = "no-cache";
  res.writeHead(200, headers);
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => (req.url.startsWith("/api/") ? apiHandler(req, res) : staticHandler(req, res)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const goOffline = async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); };

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p));
}

/* ------------------------------------------------------------------------------------- run */
if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.log("Frontend build not found — building it now...");
  const r = spawnSync("npm", ["run", "build", "-w", "apps/frontend"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) { console.error("Build failed."); process.exit(1); }
}

const exe = findChrome();
if (!exe) { console.error("No Chrome/Edge found. Set CHROME_PATH to its executable."); process.exit(2); }

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veap-demo-"));
const browser = await puppeteer.launch({ executablePath: exe, headless: HEADFUL ? false : "shell", userDataDir, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 880 });
page.on("pageerror", (e) => console.log("      [pageerror]", e.message));
if (process.env.DEBUG) {
  page.on("console", (m) => console.log("      [console]", m.type(), m.text()));
  page.on("framenavigated", (f) => console.log("      [nav]", f.url()));
  page.on("requestfailed", (r) => console.log("      [reqfail]", r.url(), r.failure()?.errorText));
  page.on("response", (r) => { if (r.status() >= 400) console.log("      [http]", r.status(), r.url()); });
}

let pass = 0, fail = 0;
const must = (c, m) => { if (!c) throw new Error(m); };
const text = () => page.evaluate(() => document.body.innerText);
const waitText = (s, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, s);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
async function step(name, fn) {
  console.log(`\n> ${name}`);
  try { await fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); await shot(`FAIL-${name.replace(/\W+/g, "-").slice(0, 40)}`).catch(() => {}); }
  await sleep(PAUSE);
}

console.log(`\nVEAP offline demo — ${HEADFUL ? "watching in Chrome" : "headless"}, screenshots -> ${SHOTS}\n`);

await step("1. Online — the live, verified Level 1 profile", async () => {
  await page.goto(`${BASE}/e/${TOKEN}`, { waitUntil: "networkidle0" });
  await waitText("Asha Verma");
  const t = await text();
  must(t.includes("O-") && t.includes("Penicillin"), "public profile info is missing");
  must(t.includes("Level 1 · Public"), "should show the live Level 1 badge");
  must(!t.includes("Offline — showing saved information"), "should not be in offline mode while online");
  await shot("01-online-live");
});

await step("2. The service worker is active and the QR is saved on the device", async () => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload({ waitUntil: "networkidle0" }); // second load: the SW takes over and caches the app shell
  await waitText("Asha Verma");
  const names = await page.evaluate(() => window.caches.keys());
  must(names.some((n) => n.startsWith("veap-shell-")), `app-shell cache missing (${names})`);
  must(names.some((n) => n.startsWith("veap-tier1-")), `saved Tier 1 cache missing (${names})`);
  const saved = await page.evaluate((k) => !!localStorage.getItem(k), `veap:tier1:${TOKEN}`);
  must(saved, "the Tier 1 copy was not saved on this device");
  await shot("02-online-saved");
});

await step("3. Offline first scan — no saved copy, so an honest 'unavailable' message", async () => {
  await goOffline(); // the network goes away: the server stops answering and is never brought back
  await page.goto(`${BASE}/e/${UNSEEN}`, { waitUntil: "domcontentloaded" });
  await waitText("No saved profile available");
  const t = await text();
  must(!t.includes("Level 1 · Public"), "must not invent a profile it never fetched");
  await shot("03-offline-unavailable");
});

await step("4. Offline — the saved Tier 1 profile, clearly marked unverified (stays here)", async () => {
  await page.goto(`${BASE}/e/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await waitText("Offline — showing saved information");
  const t = await text();
  must(t.includes("Asha Verma") && t.includes("O-") && t.includes("Penicillin"), "the saved public info did not come back");
  must(t.includes("Unverified — offline copy"), "should show the unverified-offline badge");
  must(!t.includes("Level 1 · Public"), "must NOT present the cached QR as live/valid");
  must(/Profile last updated/i.test(t), "should show when the profile was last updated");
  must(/may be out of date/i.test(t), "should warn that the information may be outdated");
  must(t.includes("Level 2 and Level 3 medical details need an internet connection."), "Tier 2/3 must be shown as online-only");
  await shot("04-offline-cached");
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Screenshots: ${SHOTS}`);

// Leave the app on the offline view so it stays in that form — nothing restores the connection.
if (HEADFUL && process.env.HOLD !== "0") {
  console.log("\nThe window is left on the offline view. Close it to finish.\n");
  await new Promise((r) => browser.once("disconnected", r));
} else {
  await browser.close();
}
await goOffline().catch(() => {});
fs.rmSync(userDataDir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
