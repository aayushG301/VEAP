import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "./env";

const NAMES = ["users", "userKeys", "profiles", "sessions", "refreshTokens", "qrTokens", "honeytokens", "scanEvents", "otps", "accessSessions", "audit", "notifications", "securityEvents", "hospitals", "staff", "breakGlass", "telegramLinks", "telegramLinkCodes"] as const;
type Name = (typeof NAMES)[number];

/** Typed-loosely collection handles, populated by connectDb(). Documents use camelCase fields; ids are strings (uuid) unless noted. */
export const col = {} as Record<Name, Collection<any>>;
let client: MongoClient | null = null;
let database: Db | null = null;
export const getDb = () => database;

export async function connectDb(): Promise<Db> {
  if (database) return database;
  client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  await client.connect();
  database = client.db(env.mongoDb);
  for (const n of NAMES) col[n] = database.collection(n);

  await Promise.all([
    col.users.createIndex({ email: 1 }, { unique: true }),
    col.sessions.createIndex({ userId: 1 }),
    col.refreshTokens.createIndex({ tokenHash: 1 }, { unique: true }),
    col.qrTokens.createIndex({ tokenHash: 1 }, { unique: true }),
    col.qrTokens.createIndex({ userId: 1, createdAt: -1 }),
    col.honeytokens.createIndex({ tokenHash: 1 }, { unique: true }),
    col.scanEvents.createIndex({ tokenId: 1, ts: -1 }),
    col.otps.createIndex({ tokenId: 1, createdAt: -1 }),
    col.accessSessions.createIndex({ tokenId: 1 }),
    col.audit.createIndex({ userId: 1, seq: 1 }, { unique: true }), // also guarantees a gap-free, race-safe chain
    col.audit.createIndex({ tokenId: 1, action: 1, createdAt: -1 }),
    col.notifications.createIndex({ userId: 1, _id: -1 }),
    col.securityEvents.createIndex({ ts: -1 }),
    col.staff.createIndex({ hospitalId: 1 }),
    col.breakGlass.createIndex({ tokenId: 1, createdAt: -1 }),
    col.breakGlass.createIndex({ staffId: 1, createdAt: -1 }),
    col.telegramLinks.createIndex({ userId: 1, chatId: 1 }, { unique: true }),
  ]);
  // Housekeeping: expire raw scan events after 24h and OTP records after ~1h. Non-fatal if the server lacks TTL support.
  await Promise.allSettled([
    col.scanEvents.createIndex({ at: 1 }, { expireAfterSeconds: 86400 }),
    col.otps.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
    col.telegramLinkCodes.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
    col.breakGlass.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return database;
}

export async function closeDb() {
  await client?.close();
  client = null; database = null;
}
