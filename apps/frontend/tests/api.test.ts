import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setAccessToken } from "../src/lib/api";

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.restoreAllMocks(); setAccessToken(null); });

describe("api client", () => {
  it("sends bearer token and session header", async () => {
    setAccessToken("AT");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    await api("/profile", { session: "SESS" });
    const h = (f.mock.calls[0][1] as any).headers;
    expect(h.Authorization).toBe("Bearer AT"); expect(h["X-Access-Session"]).toBe("SESS");
  });
  it("transparently refreshes once on 401 and retries", async () => {
    setAccessToken("OLD");
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(json(200, { accessToken: "NEW", user: {} }))
      .mockResolvedValueOnce(json(200, { done: 1 }));
    expect(await api("/profile")).toEqual({ done: 1 });
    expect(f.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect((f.mock.calls[1][1] as any).headers["X-Requested-With"]).toBe("veap");
    expect((f.mock.calls[2][1] as any).headers.Authorization).toBe("Bearer NEW");
  });
  it("surfaces API errors with code, message and validation detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(400, { error: "validation_error", message: "Invalid input", issues: [{ path: "email", message: "Invalid email" }] }));
    await expect(api("/auth/register", { body: {}, auth: false })).rejects.toMatchObject({ status: 400, code: "validation_error", message: "email: Invalid email" });
  });
  it("does not attempt refresh for auth endpoints", async () => {
    setAccessToken("x");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: "invalid_credentials", message: "bad" }));
    await expect(api("/auth/login", { body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
