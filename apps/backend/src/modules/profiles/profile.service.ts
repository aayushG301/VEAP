import { col } from "../../config/db";
import { decrypt, encrypt, newWrappedDataKey, unwrapDataKey } from "../../security/crypto";
import { DEFAULT_VISIBILITY, FIELDS, type Field, type Profile } from "./profile.schema";

async function dataKey(userId: string): Promise<Buffer> {
  let row = await col.userKeys.findOne({ _id: userId });
  if (!row) {
    const wrappedKey = newWrappedDataKey(userId);
    try { await col.userKeys.insertOne({ _id: userId, wrappedKey }); row = { wrappedKey }; }
    catch (e: any) { if (e?.code === 11000) row = await col.userKeys.findOne({ _id: userId }); else throw e; } // lost a creation race: use the winner's key
  }
  return unwrapDataKey(row!.wrappedKey, userId);
}

/** Field-level AES-256-GCM: every field is a separate ciphertext bound to (user, field) via AAD. */
export async function saveProfile(userId: string, p: Profile) {
  const key = await dataKey(userId);
  const enc: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = (p as any)[f];
    if (v !== undefined) enc[f] = encrypt(JSON.stringify(v), key, `${userId}:${f}`);
  }
  await col.profiles.updateOne({ _id: userId }, { $set: { fieldsEnc: enc, updatedAt: Date.now() }, $setOnInsert: { visibility: { ...DEFAULT_VISIBILITY } } }, { upsert: true });
}

export async function loadProfile(userId: string): Promise<{ profile: Partial<Profile>; visibility: Record<Field, number>; updatedAt: number | null }> {
  const row = await col.profiles.findOne({ _id: userId });
  if (!row) return { profile: {}, visibility: { ...DEFAULT_VISIBILITY }, updatedAt: null };
  const key = await dataKey(userId);
  const profile: any = {};
  for (const [f, c] of Object.entries((row.fieldsEnc || {}) as Record<string, string>)) profile[f] = JSON.parse(decrypt(c, key, `${userId}:${f}`));
  return { profile, visibility: { ...DEFAULT_VISIBILITY, ...(row.visibility || {}) }, updatedAt: row.updatedAt ?? null };
}

export async function saveVisibility(userId: string, v: Partial<Record<Field, number>>) {
  const cur = await loadProfile(userId);
  const merged = { ...cur.visibility, ...v };
  await col.profiles.updateOne({ _id: userId }, { $set: { visibility: merged, updatedAt: Date.now() }, $setOnInsert: { fieldsEnc: {} } }, { upsert: true });
  return merged;
}

/** Return only the fields a given tier may see (field visibility <= tier). */
export async function fieldsForTier(userId: string, tier: number): Promise<Partial<Profile>> {
  const { profile, visibility } = await loadProfile(userId);
  const out: any = {};
  for (const f of FIELDS) if ((profile as any)[f] !== undefined && (visibility[f] ?? 3) <= tier) out[f] = (profile as any)[f];
  return out;
}

const WEIGHTS: Partial<Record<Field, number>> = { fullName: 10, bloodGroup: 15, allergies: 15, emergencyContacts: 20, conditions: 10, medications: 10, doctor: 10, dateOfBirth: 5, organDonor: 5 };
export function completeness(profile: Partial<Profile>): number {
  let s = 0;
  for (const [f, w] of Object.entries(WEIGHTS)) {
    const v = (profile as any)[f];
    const filled = Array.isArray(v) ? v.length > 0 : f === "bloodGroup" ? v && v !== "Unknown" : f === "organDonor" ? v !== undefined : !!v && (typeof v !== "object" || Object.values(v).some(Boolean));
    if (filled) s += w as number;
  }
  return Math.min(100, s);
}
