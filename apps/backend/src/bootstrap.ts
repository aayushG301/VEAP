import { col } from "./config/db";
import { env } from "./config/env";
import { randomId } from "./security/crypto";
import { createQrToken } from "./security/tokens";
import { hashPassword } from "./security/passwords";

/** Creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD (if set) and plants 3 decoy QR tokens. */
export async function bootstrapAdmin() {
  if (env.adminEmail && env.adminPassword) {
    const email = env.adminEmail.toLowerCase();
    if (!(await col.users.findOne({ email }))) {
      await col.users.insertOne({ _id: randomId(), email, name: "Administrator", passwordHash: await hashPassword(env.adminPassword), role: "admin", mfaSecretEnc: null, mfaPendingEnc: null, mfaEnabled: false, recoveryHashes: [], failedLogins: 0, lockedUntil: 0, licenseNo: null, licenseIssuer: null, responderStatus: null, createdAt: Date.now() });
      console.log(`[bootstrap] admin account created: ${env.adminEmail}`);
    }
  }
  const n = await col.honeytokens.countDocuments({});
  for (let i = n; i < 3; i++) await col.honeytokens.insertOne({ tokenHash: createQrToken().tokenHash, createdAt: Date.now() });
}
