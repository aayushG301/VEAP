import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import { bootstrapAdmin } from "./bootstrap";

try { await connectDb(); }
catch (e: any) {
  console.error(`\n[veap-backend] Cannot connect to MongoDB at ${env.mongoUri}\n  ${e?.message}\n  Start MongoDB (e.g. "docker run -d -p 27017:27017 mongo:7") or set MONGO_URI to your Atlas connection string.\n`);
  process.exit(1);
}
await bootstrapAdmin();
createApp().listen(env.port, () => console.log(`[veap-backend] listening on :${env.port} (${env.nodeEnv}), db=${env.mongoDb}, otp=${env.otpMode}, ml=${env.mlServiceUrl || "fallback-only"}`));
