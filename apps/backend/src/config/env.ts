import crypto from "node:crypto";
import path from "node:path";

// Load .env from the repo root (or the current folder). Variables already set in the real environment are never overridden.
for (const f of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  try { (process as any).loadEnvFile(f); } catch { /* file missing or unreadable: ignore */ }
}

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function secret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (isProd) throw new Error(`Missing required secret ${name} (min 16 chars) in production`);
  return devDefault;
}
const num = (name: string, d: number) => (process.env[name] ? Number(process.env[name]) : d);

const masterB64 = process.env.DATA_ENCRYPTION_KEY;
let masterKey: Buffer;
if (masterB64) {
  masterKey = Buffer.from(masterB64, "base64");
  if (masterKey.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
} else if (isProd) {
  throw new Error("DATA_ENCRYPTION_KEY is required in production");
} else {
  masterKey = crypto.createHash("sha256").update("veap-dev-master-key").digest();
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd,
  isTest,
  port: num("PORT", 4000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGO_DB || "veap",
  publicUrl: process.env.PUBLIC_URL || "http://localhost:5173",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((s) => s.trim()),
  jwtAccessSecret: secret("JWT_ACCESS_SECRET", "dev-access-secret-change-me-0001"),
  accessSessionSecret: secret("ACCESS_SESSION_SECRET", "dev-session-secret-change-me-02"),
  qrSigningSecret: secret("QR_SIGNING_SECRET", "dev-qr-signing-secret-change-03"),
  passwordPepper: secret("PASSWORD_PEPPER", "dev-pepper-change-me-0004"),
  masterKey,
  otpMode: process.env.OTP_MODE || "mock",
  twilio: { sid: process.env.TWILIO_ACCOUNT_SID || "", token: process.env.TWILIO_AUTH_TOKEN || "", from: process.env.TWILIO_PHONE_NUMBER || "" },
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+91",
  mlServiceUrl: process.env.ML_SERVICE_URL ?? (isProd ? "" : "http://localhost:8001"),
  mlServiceKey: process.env.ML_SERVICE_KEY || "dev-ml-key",
  accessTokenTtlSec: 15 * 60,
  refreshTokenTtlSec: 7 * 24 * 3600,
  tier2TtlSec: 5 * 60,
  tier3TtlSec: 10 * 60,
  rateLimit: {
    global: num("RATE_LIMIT_MAX", 600),
    auth: num("AUTH_RATE_LIMIT_MAX", 30),
    scan: num("SCAN_RATE_LIMIT_MAX", 40),
    otp: num("OTP_RATE_LIMIT_MAX", 8),
  },
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
};

if (env.otpMode === "twilio" && !(env.twilio.sid && env.twilio.token && env.twilio.from)) {
  throw new Error("OTP_MODE=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER");
}
if (isProd && env.otpMode === "mock") {
  console.warn("[WARN] OTP_MODE=mock in production: OTPs will NOT be delivered and are never returned to clients.");
}
