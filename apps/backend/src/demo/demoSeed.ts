import { col } from "../config/db";
import { env } from "../config/env";
import { decryptWithMaster, encryptWithMaster, randomId } from "../security/crypto";
import { hashPassword } from "../security/passwords";
import { createQrToken } from "../security/tokens";
import { saveProfile } from "../modules/profiles/profile.service";
import { writeAudit } from "../modules/audit/audit.service";
import { seedRegistry } from "./registry";

export const DEMO_PROFILE = {
  fullName: "Asha Verma", dateOfBirth: "1990-04-02", bloodGroup: "O-" as const, allergies: ["Penicillin"], conditions: ["Type 2 diabetes", "Asthma"],
  medications: ["Warfarin 5mg", "Metformin", "Ibuprofen"], implants: ["Pacemaker"], organDonor: true,
  emergencyContacts: [{ name: "Ravi Verma", phone: "+91 98765 43210", relationship: "Brother" }],
  doctor: { name: "Dr. Rao", phone: "+91 80000 11111", hospital: "City Hospital" },
  emergencyInstructions: "I am on blood thinners (Warfarin) and have a pacemaker. I carry an inhaler in my bag.",
  insurance: "Star Health POLICY-12345", notes: "Type 2 diabetes since 2018. Well controlled on Metformin. Asthma since childhood, triggered by dust and cold air.",
  prescriptions: [
    { drug: "Warfarin", dose: "5 mg", frequency: "Once daily, evening", prescriber: "Dr. Rao (Cardiology)" },
    { drug: "Metformin", dose: "500 mg", frequency: "Twice daily with meals", prescriber: "Dr. Mehta (Endocrinology)" },
    { drug: "Salbutamol inhaler", dose: "100 mcg", frequency: "As needed", prescriber: "Dr. Gupta (Pulmonology)" },
  ],
  allergyDetails: [{ allergen: "Penicillin", reaction: "Hives and swelling of the lips", severity: "severe" as const }],
  surgeries: [{ procedure: "Dual-chamber pacemaker implantation", year: "2021", hospital: "City Hospital" }, { procedure: "Appendectomy", year: "2009", hospital: "District Hospital" }],
  vaccinations: [{ name: "Tetanus (Td booster)", date: "2024-02-10" }, { name: "COVID-19 (booster)", date: "2023-01-15" }, { name: "Influenza", date: "2025-10-05" }],
  implantDetails: [{ device: "Pacemaker (Medtronic Azure XT)", implantedYear: "2021", mriSafety: "conditional" as const }],
  advanceDirectives: { dnr: "no" as const, transfusion: "accepts" as const, otherWishes: "Please contact my brother before any major procedure." },
  preferredHospital: { name: "City Hospital, Meerut", phone: "+91 121 000 0000" },
  specialists: [{ name: "Dr. Rao", specialty: "Cardiologist", phone: "+91 80000 11111" }, { name: "Dr. Mehta", specialty: "Endocrinologist", phone: "+91 80000 22222" }],
  insuranceDetails: { provider: "Star Health", policyNumber: "POLICY-12345", tpaHelpline: "1800-425-2255" },
  lastVerifiedAt: new Date().toISOString(),
};

async function user(email: string, name: string, role: string, extra: any = {}) {
  const ex = await col.users.findOne({ email });
  if (ex) return ex;
  const doc = { _id: randomId(), email, name, passwordHash: await hashPassword(env.demoPassword), role, mfaSecretEnc: null, mfaPendingEnc: null, mfaEnabled: false, recoveryHashes: [], failedLogins: 0, lockedUntil: 0, licenseNo: extra.licenseNo ?? null, licenseIssuer: extra.licenseIssuer ?? null, responderStatus: extra.status ?? null, createdAt: Date.now() };
  await col.users.insertOne(doc);
  return doc;
}

/** Idempotent demo data: accounts, a complete patient profile, an active QR and the simulated hospital registry. */
export async function seedDemoData() {
  await seedRegistry();
  await user("admin@veap.demo", "Demo Admin", "admin");
  const patient = await user("patient@veap.demo", "Asha Verma", "patient");
  await user("doctor@veap.demo", "Dr. Meera Rao", "responder", { licenseNo: "MCI-998877", licenseIssuer: "State Medical Council", status: "pending" });
  if (!(await col.profiles.findOne({ _id: patient._id }))) await saveProfile(patient._id, DEMO_PROFILE as any);
  const q = await col.qrTokens.findOne({ userId: patient._id, status: "active" });
  let token: string;
  if (!q) {
    const t = createQrToken(); const id = randomId(); token = t.token;
    await col.qrTokens.insertOne({ _id: id, userId: patient._id, tokenHash: t.tokenHash, tokenEnc: encryptWithMaster(t.token, `qr:${id}`), status: "active", riskScore: 0, createdAt: Date.now(), revokedAt: null });
    await writeAudit({ userId: patient._id, tokenId: id, action: "token_created", actor: "seed" });
  } else token = decryptWithMaster(q.tokenEnc, `qr:${q._id}`);
  return { patientId: patient._id as string, patientEmail: "patient@veap.demo", qrUrl: `${env.publicUrl}/e/${token}` };
}
