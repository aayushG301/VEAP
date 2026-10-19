import { afterAll } from "vitest";

process.env.NODE_ENV = "test";
// Every test file gets its own throwaway database on the MongoDB at MONGO_URI (default: local mongod), dropped afterwards.
process.env.MONGO_DB = `veap_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
process.env.OTP_MODE = "mock";
process.env.ML_SERVICE_URL = "";
process.env.RATE_LIMIT_MAX = "100000";
process.env.AUTH_RATE_LIMIT_MAX = "100000";
process.env.SCAN_RATE_LIMIT_MAX = "100000";
process.env.OTP_RATE_LIMIT_MAX = "100000";

afterAll(async () => {
  const { getDb, closeDb } = await import("../src/config/db");
  try { await getDb()?.dropDatabase(); } finally { await closeDb(); }
});
