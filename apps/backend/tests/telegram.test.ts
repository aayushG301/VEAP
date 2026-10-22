import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
process.env.OTP_MODE = "telegram";
process.env.TELEGRAM_BOT_TOKEN = "123456:TESTTOKEN";
const { api, app, col, patientWithQr, request } = await import("./helpers");
const { consumeLinkCode } = await import("../src/services/telegram.service");
const { onCallback } = await import("../src/modules/telegram/telegram.handlers");
const { env } = await import("../src/config/env");
const { seedRegistry } = await import("../src/demo/registry");

const realFetch = globalThis.fetch;
const sent: { method: string; body: any }[] = [];
function mockTelegram(opts: { failSend?: boolean } = {}) {
  sent.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => {
    const url = String(u);
    if (!url.startsWith("https://api.telegram.org/bot123456:TESTTOKEN/")) return realFetch(u, init);
    const method = url.split("/").pop()!;
    sent.push({ method, body: JSON.parse(init.body || "{}") });
    if (method === "getMe") return new Response(JSON.stringify({ ok: true, result: { username: "veap_test_bot" } }));
    if (method === "sendMessage" && opts.failSend) return new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 });
    return new Response(JSON.stringify({ ok: true, result: {} }));
  });
}
afterEach(() => vi.restoreAllMocks());
beforeAll(async () => { await seedRegistry(); });
const messages = () => sent.filter((s) => s.method === "sendMessage").map((s) => s.body);

async function linkContact(p: any, chatId = "777") {
  const r = await request(app).post(api("/telegram/link")).set(p.auth);
  expect(r.status).toBe(201);
  expect(r.body.url).toMatch(/^https:\/\/t\.me\/veap_test_bot\?start=[A-Za-z0-9_-]{10,}$/);
  const code = r.body.url.split("start=")[1];
  expect(await consumeLinkCode(code, chatId, "Ravi Verma")).toBe(p.user.id);
  return code;
}

describe("Telegram Level 2 codes", () => {
  it("only the patient can create a link; codes are one-time and unknown codes are refused", async () => {
    mockTelegram();
    const p = await patientWithQr();
    expect((await request(app).post(api("/telegram/link"))).status).toBe(401);
    const code = await linkContact(p);
    expect(await consumeLinkCode(code, "888", "Eve")).toBeNull();            // already used
    expect(await consumeLinkCode("nonsense-code-123", "888", "Eve")).toBeNull();
    const st = await request(app).get(api("/telegram")).set(p.auth);
    expect(st.body.links).toHaveLength(1); expect(st.body.links[0].chatName).toBe("Ravi Verma"); expect(st.body.active).toBe(true);
    expect(JSON.stringify(await col.telegramLinkCodes.find({}).toArray())).not.toContain(code); // only a hash is stored
  });

  it("refuses to send a code when no contact has connected Telegram", async () => {
    mockTelegram();
    const p = await patientWithQr();
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.status).toBe(409); expect(o.body.error).toBe("contact_not_linked");
    expect(messages()).toHaveLength(0);
    expect(await col.otps.countDocuments({ tokenId: p.tokenId })).toBe(0);
  });

  it("sends the code to the contact's Telegram, never to the browser, and the code unlocks Level 2", async () => {
    mockTelegram();
    const p = await patientWithQr(); await linkContact(p);
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.status).toBe(201);
    expect(o.body.devOtp).toBeUndefined(); expect(o.body.delivery).toBe("telegram"); expect(o.body.sentTo).toBe("emergency_contact");
    expect(JSON.stringify(o.body)).not.toMatch(/\b\d{6}\b/);
    const m = messages()[0];
    expect(m.chat_id).toBe("777"); expect(m.parse_mode).toBe("HTML");
    const code = m.text.match(/<code>(\d{6})<\/code>/)[1];
    expect(m.text).toContain("Asha");
    expect(m.reply_markup.inline_keyboard[0][0].callback_data).toBe(`otp:d:${o.body.otpId}`);
    const bad = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code: code === "000000" ? "111111" : "000000" });
    expect(bad.status).toBe(401);
    const v = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code });
    expect(v.status).toBe(201); expect(v.body.tier).toBe(2);
  });

  it("the contact can block a code from Telegram; strangers' chats cannot", async () => {
    mockTelegram();
    const p = await patientWithQr(); await linkContact(p);
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    const code = messages()[0].text.match(/<code>(\d{6})<\/code>/)[1];
    expect(await onCallback(`otp:d:${o.body.otpId}`, "999")).toMatch(/not an emergency contact/);
    expect(await onCallback(`otp:d:${o.body.otpId}`, "777")).toMatch(/Blocked/);
    const v = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code });
    expect(v.status).toBe(400);                                           // the code is dead even though it was correct
    const a = await request(app).get(api("/audit")).set(p.auth);
    expect(a.body.entries.map((e: any) => e.action)).toContain("otp_denied_by_contact");
  });

  it("returns a clear error (and keeps no code) when Telegram delivery fails", async () => {
    mockTelegram({ failSend: true });
    const p = await patientWithQr(); await linkContact(p);
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(o.status).toBe(502); expect(o.body.error).toBe("sms_failed");
    expect(await col.otps.countDocuments({ tokenId: p.tokenId })).toBe(0);
  });

  it("level 3 requests are pushed to the contact with Approve / Deny buttons", async () => {
    mockTelegram(); env.breakGlass.delaySec = 3600;
    const p = await patientWithQr(); await linkContact(p);
    const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    const code = messages()[0].text.match(/<code>(\d{6})<\/code>/)[1];
    const v = await request(app).post(api("/access/otp/verify")).send({ token: p.qrToken, otpId: o.body.otpId, code });
    const bg = await request(app).post(api("/access/break-glass")).set("X-Access-Session", v.body.sessionToken)
      .send({ token: p.qrToken, hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-48213", pin: "482913", reason: "Patient collapsed at the station, unresponsive" });
    expect(bg.status).toBe(202); expect(bg.body.contactNotified).toBe(true);
    const m = messages().pop()!;
    expect(m.text).toContain("Dr. Ananya Rao"); expect(m.text).toContain("NMC-DL-48213"); expect(m.text).toContain("AIIMS");
    const [approve, deny] = m.reply_markup.inline_keyboard[0];
    expect(approve.callback_data).toBe(`bg:a:${bg.body.requestId}`); expect(deny.callback_data).toBe(`bg:d:${bg.body.requestId}`);
    expect(await onCallback(deny.callback_data, "777")).toMatch(/Denied/);
    const poll = await request(app).get(api(`/access/break-glass/${bg.body.requestId}`)).set("X-Access-Session", v.body.sessionToken);
    expect(poll.body.status).toBe("denied");
  });

  it("escapes HTML in names so a malicious profile cannot inject markup into the alert", async () => {
    mockTelegram();
    const p = await patientWithQr(); await linkContact(p);
    const prof = await request(app).get(api("/profile")).set(p.auth);
    await request(app).put(api("/profile")).set(p.auth).send({ ...prof.body.profile, fullName: "<b>Evil</b> & Co" });
    await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
    expect(messages()[0].text).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });
});

describe("mock mode in production", () => {
  it("never returns the code unless ALLOW_DEMO_OTP is explicitly set", async () => {
    mockTelegram();
    (env as any).otpMode = "mock"; (env as any).isProd = true;
    try {
      const p = await patientWithQr();
      const o = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
      expect(o.body.devOtp).toBeUndefined();
      (env as any).demoOtp = true;
      const o2 = await request(app).post(api("/access/otp/request")).send({ token: p.qrToken, phone: "+91 90000 12345" });
      expect(o2.body.devOtp).toMatch(/^\d{6}$/);
    } finally { (env as any).otpMode = "telegram"; (env as any).isProd = false; (env as any).demoOtp = false; }
  });
});
