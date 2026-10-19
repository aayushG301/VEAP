import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/lib/auth";
import { ToastProvider } from "../src/components/Toast";

const json = (status: number, body: any, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const TOKEN = "a".repeat(22) + "." + "b".repeat(20);
const tier1 = { tier: 1, risk: { level: "low" }, data: { fullName: "Asha Verma", bloodGroup: "O-", allergies: ["Penicillin"], emergencyInstructions: "EpiPen in left pocket", emergencyContacts: [{ name: "Ravi", phone: "+91 98765 43210", relationship: "Brother" }] } };

function mount(path: string, routes: (url: string, init?: any) => Response | undefined) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.endsWith("/auth/refresh")) return json(401, { error: "no_refresh" });
    return routes(url, init) ?? json(404, { error: "not_found", message: "nope" });
  });
  return render(<MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></MemoryRouter>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("public pages", () => {
  it("renders the landing page with logo, hero and the three access levels", async () => {
    mount("/", () => undefined);
    expect(await screen.findByText(/Always Ready\./)).toBeInTheDocument();
    expect(screen.getAllByLabelText("VEAP logo").length).toBeGreaterThan(0);
    expect(screen.getByText("Three levels of access")).toBeInTheDocument();
    expect(screen.getByText("Level 2 · Verified")).toBeInTheDocument();
  });
  it("redirects protected routes to login when signed out", async () => {
    mount("/dashboard", () => undefined);
    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  });
  it("shows an error for invalid login and lets you toggle password visibility", async () => {
    mount("/login", (u) => (u.endsWith("/auth/login") ? json(401, { error: "invalid_credentials", message: "Invalid email or password" }) : undefined));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "a@b.co" } });
    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(pw, { target: { value: "wrongpass" } });
    expect(pw.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw.type).toBe("text");
    fireEvent.submit(screen.getByRole("form", { name: "login form" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
  it("registration shows a live password checklist", async () => {
    mount("/register", () => undefined);
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "abc" } });
    expect(screen.getByText(/○ 10\+ characters/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ngPassw0rd!" } });
    expect(screen.getByText(/✓ 10\+ characters/)).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });
  it("404 page offers a way home", async () => {
    mount("/nope", () => undefined);
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});

describe("emergency page", () => {
  it("shows Level 1, runs the OTP flow (code goes to the emergency contact), unlocks Level 2 and offers the override", async () => {
    let otpBody: any = null;
    mount(`/e/${TOKEN}`, (u, init) => {
      if (u.includes(`/emergency/${TOKEN}/record`)) return json(200, { tier: 2, via: "otp", expiresAt: Date.now() + 300000, extended: false, data: { ...tier1.data, medications: ["Warfarin"] }, warnings: [{ level: "high", message: "Anticoagulant plus NSAID: major bleeding risk." }] });
      if (u.includes(`/emergency/${TOKEN}`)) return json(200, tier1);
      if (u.endsWith("/access/otp/request")) { otpBody = JSON.parse(init.body); return json(201, { otpId: "otp-123456", devOtp: "123456", expiresInSec: 300, sentTo: "emergency_contact", contactName: "Ravi", maskedTarget: "+91 ******3210" }); }
      if (u.endsWith("/access/otp/verify")) return json(201, { sessionToken: "S", tier: 2, expiresAt: Date.now() + 300000 });
      return undefined;
    });
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.getByText(/O-/)).toBeInTheDocument();
    expect(screen.getAllByText("Penicillin").length).toBeGreaterThan(0);
    expect(screen.getByText("EpiPen in left pocket")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call Ravi/ })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("button", { name: /Emergency override/ })).toBeDisabled(); // needs Level 2 first
    fireEvent.change(screen.getByLabelText("Your phone number"), { target: { value: "+91 90000 12345" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code to the emergency contact/ }));
    expect(await screen.findByText(/Demo mode/)).toBeInTheDocument();
    expect(screen.getByText(/Ravi/, { selector: "b" })).toBeInTheDocument();
    expect(otpBody.phone).toBe("+91 90000 12345");
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(await screen.findByText(/Anticoagulant plus NSAID/)).toBeInTheDocument();
    expect(await screen.findByText("Warfarin")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Session time remaining" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Emergency override/ })).toBeEnabled());
  });
  it("shows a locked message for locked tokens", async () => {
    mount(`/e/${TOKEN}`, (u) => (u.includes("/emergency/") ? json(423, { error: "token_locked", message: "locked" }) : undefined));
    expect(await screen.findByText("Temporarily locked")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Call 112/ }).length).toBeGreaterThan(0);
  });
  it("shows a revoked message for revoked tokens", async () => {
    mount(`/e/${TOKEN}`, (u) => (u.includes("/emergency/") ? json(410, { error: "token_revoked", message: "revoked" }) : undefined));
    expect(await screen.findByText("QR code revoked")).toBeInTheDocument();
  });
  it("shows a rate-limit screen with a countdown from Retry-After", async () => {
    mount(`/e/${TOKEN}`, (u) => (u.includes("/emergency/") ? json(429, { error: "rate_limited", message: "slow down" }, { "retry-after": "42" }) : undefined));
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByText(/Retrying automatically in 4\d?s/)).toBeInTheDocument();
  });
  it("falls back to the saved Level 1 copy when offline", async () => {
    localStorage.setItem(`veap:tier1:${TOKEN}`, JSON.stringify({ at: Date.now() - 60000, data: tier1 }));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<MemoryRouter initialEntries={[`/e/${TOKEN}`]}><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></MemoryRouter>);
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Offline: showing the information saved/)).toBeInTheDocument());
  });
});
