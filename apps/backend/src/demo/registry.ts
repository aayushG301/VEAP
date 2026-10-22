import { col } from "../config/db";
import { hashPassword } from "../security/passwords";

/**
 * SIMULATED hospital & medical-council registry used for Level 3 emergency override.
 * In production this would be a lookup against the National Medical Commission register and each hospital's HR system.
 * For the hackathon it is a seeded MongoDB collection, but the checks around it (hashed PINs, lockout, suspension,
 * daily limits, contact approval, audit) are real.
 */
export const DEMO_HOSPITALS = [
  { _id: "HSP-DEL-0001", name: "AIIMS Trauma Centre (Simulated)", city: "New Delhi", status: "active" },
  { _id: "HSP-MRT-0002", name: "Anand Multispeciality Hospital (Simulated)", city: "Meerut", status: "active" },
  { _id: "HSP-LKO-0003", name: "Lakeview Medical College (Simulated)", city: "Lucknow", status: "suspended" },
] as const;

export const DEMO_STAFF = [
  { staffId: "NMC-DL-48213", hospitalId: "HSP-DEL-0001", name: "Dr. Ananya Rao", designation: "Emergency Medicine Consultant", pin: "482913", status: "active" },
  { staffId: "NMC-UP-30517", hospitalId: "HSP-MRT-0002", name: "Dr. Vikram Singh", designation: "Trauma Surgeon", pin: "305172", status: "active" },
  { staffId: "NMC-UP-77002", hospitalId: "HSP-MRT-0002", name: "Meena Joshi", designation: "Emergency Nurse", pin: "770021", status: "active" },
  { staffId: "NMC-DL-99999", hospitalId: "HSP-DEL-0001", name: "Dr. R. Suspended (license revoked)", designation: "Physician", pin: "999999", status: "suspended" },
  { staffId: "NMC-UP-11111", hospitalId: "HSP-LKO-0003", name: "Dr. Kiran Das", designation: "Physician", pin: "111111", status: "active" },
] as const;

/** Idempotent: inserts missing hospitals/staff and never overwrites existing PINs or lock state. */
export async function seedRegistry() {
  for (const h of DEMO_HOSPITALS) await col.hospitals.updateOne({ _id: h._id }, { $setOnInsert: { ...h, createdAt: Date.now() } }, { upsert: true });
  for (const s of DEMO_STAFF) {
    if (await col.staff.findOne({ _id: s.staffId })) continue;
    await col.staff.insertOne({ _id: s.staffId, hospitalId: s.hospitalId, name: s.name, designation: s.designation, pinHash: await hashPassword(s.pin), status: s.status, failedPins: 0, lockedUntil: 0, createdAt: Date.now() });
  }
}

/** Shown on the responder screen only when DEMO_SEED=true, so judges can try a valid and an invalid identity. */
export const demoHints = () => ({
  note: "Simulated registry for the hackathon demo. Real deployments verify against the medical-council and hospital registers.",
  valid: DEMO_STAFF.filter((s) => s.status === "active" && s.hospitalId !== "HSP-LKO-0003").slice(0, 2).map((s) => ({ hospitalId: s.hospitalId, staffId: s.staffId, pin: s.pin, name: s.name })),
  rejected: [
    { label: "Revoked licence", hospitalId: "HSP-DEL-0001", staffId: "NMC-DL-99999", pin: "999999" },
    { label: "Suspended hospital", hospitalId: "HSP-LKO-0003", staffId: "NMC-UP-11111", pin: "111111" },
  ],
});
