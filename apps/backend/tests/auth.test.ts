import { describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { api, app, col, PW, registerPatient, request, uniqueEmail } from "./helpers";

describe("registration & login", () => {
  it("registers, returns access token, sets httpOnly strict refresh cookie", async () => {
    const r = await request(app).post(api("/auth/register")).send({ email: uniqueEmail(), password: PW, name: "A" });
    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeTruthy();
    const c = String(r.headers["set-cookie"]);
    expect(c).toMatch(/veap_rt=/); expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
  });
  it("rejects weak passwords and bad emails", async () => {
    expect((await request(app).post(api("/auth/register")).send({ email: uniqueEmail(), password: "short", name: "A" })).status).toBe(400);
    expect((await request(app).post(api("/auth/register")).send({ email: uniqueEmail(), password: "alllowercase1234", name: "A" })).status).toBe(400);
    expect((await request(app).post(api("/auth/register")).send({ email: "nope", password: PW, name: "A" })).status).toBe(400);
  });
  it("rejects duplicate emails (case-insensitive)", async () => {
    const e = uniqueEmail();
    await request(app).post(api("/auth/register")).send({ email: e, password: PW, name: "A" });
    const r = await request(app).post(api("/auth/register")).send({ email: e.toUpperCase(), password: PW, name: "B" });
    expect(r.status).toBe(409);
  });
  it("stores passwords as argon2id hashes", async () => {
    const { email } = await registerPatient();
    const row: any = await col.users.findOne({ email });
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
  it("gives the same error for wrong password and unknown user", async () => {
    const { email } = await registerPatient();
    const a = await request(app).post(api("/auth/login")).send({ email, password: "WrongPassw0rd!x" });
    const b = await request(app).post(api("/auth/login")).send({ email: uniqueEmail("ghost"), password: PW });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });
  it("locks the account after 5 failures", async () => {
    const { email } = await registerPatient();
    for (let i = 0; i < 5; i++) await request(app).post(api("/auth/login")).send({ email, password: "WrongPassw0rd!x" });
    const r = await request(app).post(api("/auth/login")).send({ email, password: PW });
    expect(r.status).toBe(423);
  });
  it("protects routes and rejects forged JWTs", async () => {
    expect((await request(app).get(api("/profile"))).status).toBe(401);
    expect((await request(app).get(api("/profile")).set("Authorization", "Bearer abc.def.ghi")).status).toBe(401);
  });
});

describe("refresh rotation & sessions", () => {
  it("rotates refresh tokens and detects reuse (revoking the session)", async () => {
    const e = uniqueEmail();
    const reg = await request(app).post(api("/auth/register")).send({ email: e, password: PW, name: "A" });
    const cookie1 = String(reg.headers["set-cookie"]).split(";")[0];
    expect((await request(app).post(api("/auth/refresh")).send()).status).toBe(403); // CSRF header missing
    const r1 = await request(app).post(api("/auth/refresh")).set("X-Requested-With", "veap").set("Cookie", cookie1);
    expect(r1.status).toBe(200);
    const cookie2 = String(r1.headers["set-cookie"]).split(";")[0];
    expect(cookie2).not.toEqual(cookie1);
    const replay = await request(app).post(api("/auth/refresh")).set("X-Requested-With", "veap").set("Cookie", cookie1);
    expect(replay.status).toBe(401); expect(replay.body.error).toBe("refresh_reuse");
    const after = await request(app).post(api("/auth/refresh")).set("X-Requested-With", "veap").set("Cookie", cookie2);
    expect(after.status).toBe(401); // whole session family is dead
    expect((await request(app).get(api("/auth/me")).set("Authorization", `Bearer ${r1.body.accessToken}`)).status).toBe(401);
  });
  it("logout and device revoke kill access tokens immediately", async () => {
    const p = await registerPatient();
    const s2 = await request(app).post(api("/auth/login")).send({ email: p.email, password: PW });
    const list = await request(app).get(api("/auth/sessions")).set(p.auth);
    expect(list.body.sessions.length).toBe(2);
    const other = list.body.sessions.find((s: any) => !s.current);
    expect((await request(app).delete(api(`/auth/sessions/${other.id}`)).set(p.auth)).status).toBe(200);
    expect((await request(app).get(api("/auth/me")).set("Authorization", `Bearer ${s2.body.accessToken}`)).status).toBe(401);
    expect((await request(app).get(api("/auth/me")).set(p.auth)).status).toBe(200);
  });
});

describe("TOTP MFA", () => {
  it("full MFA lifecycle with single-use recovery codes", async () => {
    const p = await registerPatient();
    const setup = await request(app).post(api("/auth/mfa/setup")).set(p.auth);
    expect(setup.body.secret).toBeTruthy();
    expect((await request(app).post(api("/auth/mfa/enable")).set(p.auth).send({ code: "000000" })).status).toBe(400);
    const en = await request(app).post(api("/auth/mfa/enable")).set(p.auth).send({ code: authenticator.generate(setup.body.secret) });
    expect(en.status).toBe(200); expect(en.body.recoveryCodes).toHaveLength(8);
    const login = await request(app).post(api("/auth/login")).send({ email: p.email, password: PW });
    expect(login.body.mfaRequired).toBe(true); expect(login.body.accessToken).toBeUndefined();
    expect((await request(app).post(api("/auth/mfa/login")).send({ mfaToken: login.body.mfaToken, code: "123456" })).status).toBe(401);
    const ok = await request(app).post(api("/auth/mfa/login")).send({ mfaToken: login.body.mfaToken, code: authenticator.generate(setup.body.secret) });
    expect(ok.status).toBe(200); expect(ok.body.accessToken).toBeTruthy();
    const rc = en.body.recoveryCodes[0];
    expect((await request(app).post(api("/auth/mfa/login")).send({ mfaToken: login.body.mfaToken, code: rc })).status).toBe(200);
    expect((await request(app).post(api("/auth/mfa/login")).send({ mfaToken: login.body.mfaToken, code: rc })).status).toBe(401);
  });
  it("encrypts the TOTP secret at rest", async () => {
    const p = await registerPatient();
    const setup = await request(app).post(api("/auth/mfa/setup")).set(p.auth);
    await request(app).post(api("/auth/mfa/enable")).set(p.auth).send({ code: authenticator.generate(setup.body.secret) });
    const row: any = await col.users.findOne({ _id: p.user.id });
    expect(row.mfaSecretEnc).not.toContain(setup.body.secret);
  });
});
