import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/lib/auth";
import { ToastProvider } from "../src/components/Toast";
import OverridePanel from "../src/features/emergency/OverridePanel";
import { Watermark } from "../src/components/Watermark";
import { RecordList } from "../src/features/emergency/RecordView";

const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const demo = { note: "Simulated", valid: [{ hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-48213", pin: "482913", name: "Dr. Ananya Rao" }], rejected: [{ label: "Revoked licence", hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-99999", pin: "999999" }] };

function fillForm(pin = "482913") {
  fireEvent.change(screen.getByLabelText("Hospital ID"), { target: { value: "HSP-DEL-0001" } });
  fireEvent.change(screen.getByLabelText(/Staff \/ council registration ID/), { target: { value: "NMC-DL-48213" } });
  fireEvent.change(screen.getByLabelText(/Staff PIN/), { target: { value: pin } });
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Patient unconscious after road accident" } });
}

describe("Level 3 override panel", () => {
  it("needs hospital ID, staff ID, 6-digit PIN and a reason before it can be submitted", () => {
    render(<OverridePanel token="t" session="S" demo={null} onGranted={() => {}} onCancel={() => {}} onSessionLost={() => {}} />);
    const btn = screen.getByRole("button", { name: /Verify & request access/ });
    expect(btn).toBeDisabled();
    fillForm("12"); expect(btn).toBeDisabled();
    fillForm("482913"); expect(btn).toBeEnabled();
  });

  it("shows the registry's refusal, clears the PIN, and offers the demo identities only in demo mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: "verification_failed", message: "Hospital ID, staff ID or PIN is not valid. Check them and try again." }));
    render(<OverridePanel token="t" session="S" demo={demo} onGranted={() => {}} onCancel={() => {}} onSessionLost={() => {}} />);
    expect(screen.getByText(/simulated hospital registry/)).toBeInTheDocument();
    fillForm("000000");
    fireEvent.click(screen.getByRole("button", { name: /Verify & request access/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid/);
    expect((screen.getByLabelText(/Staff PIN/) as HTMLInputElement).value).toBe("");
  });

  it("waits for the contact, then hands over the Level 3 session", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => {
      const url = String(u); calls.push(`${init?.method || "GET"} ${url}`);
      if (url.endsWith("/access/break-glass")) { expect(JSON.parse(init.body)).toMatchObject({ hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-48213", pin: "482913" }); return json(202, { requestId: "R1", status: "pending", delaySec: 60, autoGrantAt: Date.now() + 60000, contactNotified: true, responder: { name: "Dr. Ananya Rao", designation: "Emergency Medicine Consultant", hospital: "AIIMS Trauma Centre (Simulated)" } }); }
      return json(200, { status: "approved", tier: 3, expiresAt: Date.now() + 600000, sessionToken: "TIER3" });
    });
    const granted = vi.fn();
    render(<OverridePanel token="t" session="S" demo={null} onGranted={granted} onCancel={() => {}} onSessionLost={() => {}} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Verify & request access/ }));
    expect(await screen.findByText(/Identity verified/)).toHaveTextContent("Dr. Ananya Rao");
    expect(screen.getByText(/asked on Telegram/)).toBeInTheDocument();
    await waitFor(() => expect(granted).toHaveBeenCalledWith({ sessionToken: "TIER3", tier: 3, expiresAt: expect.any(Number) }));
    expect(calls.some((c) => c.endsWith("/access/break-glass/R1"))).toBe(true);
  });

  it("shows a clear message when the contact denies", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any) => (String(u).endsWith("/access/break-glass") ? json(202, { requestId: "R2", status: "pending", delaySec: 60, autoGrantAt: Date.now() + 60000, contactNotified: true, responder: { name: "Dr", designation: "d", hospital: "h" } }) : json(200, { status: "denied" })));
    render(<OverridePanel token="t" session="S" demo={null} onGranted={() => {}} onCancel={() => {}} onSessionLost={() => {}} />);
    fillForm(); fireEvent.click(screen.getByRole("button", { name: /Verify & request access/ }));
    expect(await screen.findByText("Request denied")).toBeInTheDocument();
  });
});

describe("Level 3 record rendering", () => {
  it("renders the detailed clinical fields and hides 'unknown' directives", () => {
    render(<RecordList data={{ prescriptions: [{ drug: "Warfarin", dose: "5 mg", frequency: "daily", prescriber: "Dr Rao" }], surgeries: [{ procedure: "Appendectomy", year: "2009", hospital: "District Hospital" }],
      implantDetails: [{ device: "Pacemaker", implantedYear: "2021", mriSafety: "conditional" }], advanceDirectives: { dnr: "yes", transfusion: "refuses", otherWishes: "Call my brother" },
      vaccinations: [{ name: "Tetanus", date: "2024-02-10" }], insuranceDetails: { provider: "Star Health", policyNumber: "P1", tpaHelpline: "1800" }, allergyDetails: [{ allergen: "Penicillin", reaction: "Hives", severity: "severe" }] }} />);
    expect(screen.getByText("Warfarin")).toBeInTheDocument();
    expect(screen.getByText("MRI conditional")).toBeInTheDocument();
    expect(screen.getByText(/DNR: do not resuscitate/)).toBeInTheDocument();
    expect(screen.getByText("REFUSES")).toBeInTheDocument();
    expect(screen.getByText("severe")).toBeInTheDocument();
    expect(screen.getByText("Surgical & hospital history")).toBeInTheDocument();
    cleanup();
    render(<RecordList data={{ advanceDirectives: { dnr: "unknown", transfusion: "unknown" }, fullName: "A" }} />);
    expect(screen.queryByText("Advance directives")).toBeNull();
  });
  it("watermarks the screen with the responder's name, ID, role and hospital", () => {
    render(<Watermark lines={["Dr. Ananya Rao · ID NMC-DL-48213", "Emergency Medicine Consultant · AIIMS Trauma Centre", "VEAP LEVEL 3 · 27 Oct 2026"]} />);
    const el = screen.getByTestId("watermark");
    expect(el.textContent).toContain("Dr. Ananya Rao");
    expect(el.textContent).toContain("NMC-DL-48213");
    expect(el.textContent).toContain("AIIMS Trauma Centre");
    expect(el.getAttribute("class")).toContain("watermark");
  });
});

describe("Telegram card", () => {
  it("lets the patient create a connect link and shows connected contacts", async () => {
    let linked = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => {
      const url = String(u);
      if (url.endsWith("/auth/refresh")) return json(200, { accessToken: "A", user: { id: "u1", name: "Asha", email: "a@b.co", role: "patient", mfaEnabled: false } });
      if (url.endsWith("/telegram/link")) { linked = true; return json(201, { url: "https://t.me/veap_bot?start=abc", qrDataUrl: "data:image/png;base64,AAAA", expiresAt: Date.now() + 600000, botUsername: "veap_bot" }); }
      if (url.endsWith("/telegram")) return json(200, { configured: true, active: true, botUsername: "veap_bot", links: linked ? [{ id: "L1", chatName: "Ravi Verma", linkedAt: Date.now() }] : [] });
      if (url.includes("/auth/sessions")) return json(200, { sessions: [] });
      return json(404, { error: "x" });
    });
    const TelegramCard = (await import("../src/features/security/TelegramCard")).default;
    render(<MemoryRouter><ToastProvider><AuthProvider><TelegramCard /></AuthProvider></ToastProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Connect emergency contact" }));
    expect(await screen.findByAltText("Telegram connect QR code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Telegram" })).toHaveAttribute("href", "https://t.me/veap_bot?start=abc");
  });
});
void App;