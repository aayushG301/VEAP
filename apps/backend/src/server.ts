import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import { bootstrapAdmin } from "./bootstrap";
import { seedDemoData } from "./demo/demoSeed";
import { registerTelegramHandlers } from "./modules/telegram/telegram.handlers";
import { startTelegramBot } from "./services/telegram.service";

try { await connectDb(); }
catch (e: any) {
  console.error(`\n[veap-backend] Cannot connect to MongoDB (${env.mongoDb})\n  ${e?.message}\n  Start MongoDB (e.g. "docker run -d -p 27017:27017 mongo:7") or set MONGO_URI to your Atlas connection string.\n`);
  process.exit(1);
}
await bootstrapAdmin();
if (env.demoSeed) {
  const d = await seedDemoData();
  console.log(`[demo] demo data ready. Patient login: ${d.patientEmail}  QR link: ${d.qrUrl}`);
}
registerTelegramHandlers();
if (env.otpMode === "telegram") startTelegramBot();
createApp().listen(env.port, () => console.log(`[veap-backend] listening on :${env.port} (${env.nodeEnv}), db=${env.mongoDb}, otp=${env.otpMode}, trust-proxy=${env.trustProxy}, ml=${env.mlServiceUrl || "fallback-only"}`));
