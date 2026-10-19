import { describe, expect, it } from "vitest";
import { api, app, col, patientWithQr, request, tier2 } from "./helpers";

describe("tamper-evident audit log", () => {
  it("verifies an intact chain", async () => {
    const p = await patientWithQr();
    await request(app).get(api(`/emergency/${p.qrToken}`));
    await tier2(p.qrToken);
    const v = await request(app).get(api("/audit/verify")).set(p.auth);
    expect(v.body.valid).toBe(true); expect(v.body.count).toBeGreaterThan(4);
  });
  it("detects an edited entry", async () => {
    const p = await patientWithQr();
    await request(app).get(api(`/emergency/${p.qrToken}`));
    const row: any = await col.audit.findOne({ userId: p.user.id, action: "scan" });
    await col.audit.updateOne({ _id: row._id }, { $set: { actor: "someone-else" } });
    const v = await request(app).get(api("/audit/verify")).set(p.auth);
    expect(v.body.valid).toBe(false); expect(v.body.brokenAtId).toBe(row.seq);
  });
  it("detects a deleted entry in the middle of the chain", async () => {
    const p = await patientWithQr();
    await request(app).get(api(`/emergency/${p.qrToken}`)); await request(app).get(api(`/emergency/${p.qrToken}`));
    const rows: any[] = await col.audit.find({ userId: p.user.id }).sort({ seq: 1 }).toArray();
    await col.audit.deleteOne({ _id: rows[2]._id });
    expect((await request(app).get(api("/audit/verify")).set(p.auth)).body.valid).toBe(false);
  });
  it("concurrent writers cannot fork the chain (same process and simulated multi-instance)", async () => {
    const { writeAudit, appendAudit } = await import("../src/modules/audit/audit.service");
    const p = await patientWithQr();
    await Promise.all(Array.from({ length: 12 }, (_, i) => writeAudit({ userId: p.user.id, action: `parallel_${i}`, actor: "test" })));
    // appendAudit bypasses the in-process queue: this is what two separate server instances racing each other look like
    await Promise.all(Array.from({ length: 12 }, (_, i) => appendAudit({ userId: p.user.id, action: `instance_${i}`, actor: "test" })));
    const v = await request(app).get(api("/audit/verify")).set(p.auth);
    expect(v.body.valid).toBe(true);
    const seqs = (await col.audit.find({ userId: p.user.id }).sort({ seq: 1 }).toArray()).map((r: any) => r.seq);
    expect(seqs).toEqual(seqs.map((_: number, i: number) => i + 1));
  });
  it("owners only see their own audit trail and analytics", async () => {
    const a = await patientWithQr(); const b = await patientWithQr();
    await request(app).get(api(`/emergency/${a.qrToken}?lat=1&lng=2`));
    const bTrail = await request(app).get(api("/audit")).set(b.auth);
    expect(bTrail.body.entries.every((e: any) => e.action !== "scan")).toBe(true);
    const an = await request(app).get(api("/audit/analytics")).set(a.auth);
    expect(an.body.byAction.find((x: any) => x.action === "scan").n).toBe(1);
    expect(an.body.geoPoints.length).toBe(1);
  });
});
