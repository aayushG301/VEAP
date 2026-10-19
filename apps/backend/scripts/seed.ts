/* Seeds a demo admin, patient (with profile + QR) and a pending responder. Safe to re-run. */
import { closeDb, col, connectDb } from "../src/config/db";
import { env } from "../src/config/env";
import { decryptWithMaster, encryptWithMaster, randomId } from "../src/security/crypto";
import { hashPassword } from "../src/security/passwords";
import { createQrToken } from "../src/security/tokens";
import { saveProfile } from "../src/modules/profiles/profile.service";
import { writeAudit } from "../src/modules/audit/audit.service";
import { bootstrapAdmin } from "../src/bootstrap";

if (env.isProd) { console.error("Refusing to seed demo data in production."); process.exit(1); }
const PW = "DemoPassw0rd!";

try { await connectDb(); }
catch (e: any) { console.error(`Cannot connect to MongoDB at ${env.mongoUri}: ${e?.message}\nStart MongoDB or set MONGO_URI.`); process.exit(1); }

async function user(email: string, name: string, role: string, extra: any = {}) {
  const ex = await col.users.findOne({ email });
  if (ex) return ex;
  const doc = { _id: randomId(), email, name, passwordHash: await hashPassword(PW), role, mfaSecretEnc: null, mfaPendingEnc: null, mfaEnabled: false, recoveryHashes: [], failedLogins: 0, lockedUntil: 0, licenseNo: extra.licenseNo ?? null, licenseIssuer: extra.licenseIssuer ?? null, responderStatus: extra.status ?? null, createdAt: Date.now() };
  await col.users.insertOne(doc);
  return doc;
}

await bootstrapAdmin();
await user("admin@veap.demo", "Demo Admin", "admin");
const patient = await user("patient@veap.demo", "Asha Verma", "patient");
await user("doctor@veap.demo", "Dr. Meera Rao", "responder", { licenseNo: "MCI-998877", licenseIssuer: "State Medical Council", status: "pending" });

await saveProfile(patient._id, {
  fullName: "Asha Verma", dateOfBirth: "1990-04-02", bloodGroup: "O-", allergies: ["Penicillin"], conditions: ["Type 2 diabetes", "Asthma"],
  medications: ["Warfarin 5mg", "Metformin", "Ibuprofen"], implants: ["Pacemaker"], organDonor: true,
  emergencyContacts: [{ name: "Ravi Verma", phone: "+91 98765 43210", relationship: "Brother" }],
  doctor: { name: "Dr. Rao", phone: "+91 80000 11111", hospital: "City Hospital" }, insurance: "POLICY-12345", notes: "Demo notes visible only at Tier 3.",
});
const q = await col.qrTokens.findOne({ userId: patient._id, status: "active" });
let token: string;
if (!q) {
  const t = createQrToken(); const id = randomId(); token = t.token;
  await col.qrTokens.insertOne({ _id: id, userId: patient._id, tokenHash: t.tokenHash, tokenEnc: encryptWithMaster(t.token, `qr:${id}`), status: "active", riskScore: 0, createdAt: Date.now(), revokedAt: null });
  await writeAudit({ userId: patient._id, tokenId: id, action: "token_created", actor: "seed" });
} else token = decryptWithMaster(q.tokenEnc, `qr:${q._id}`);

console.log("\nDemo data ready (password for all accounts: " + PW + ")");
console.log("  admin    admin@veap.demo");
console.log("  patient  patient@veap.demo");
console.log("  doctor   doctor@veap.demo (pending approval: approve it in the admin console)");
console.log(`  QR link  ${env.publicUrl}/e/${token}\n`);
await closeDb();
