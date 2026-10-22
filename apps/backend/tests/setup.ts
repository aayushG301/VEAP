import { afterAll } from "vitest";

process.env.NODE_ENV = "test";
// Tests must NEVER touch the database configured in .env (it may be a live Atlas cluster). They use TEST_MONGO_URI or a local mongod.
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017";
process.env.TRUST_PROXY = "0";
process.env.DEMO_SEED = "false";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.BREAK_GLASS_DELAY_SEC = "0";
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
