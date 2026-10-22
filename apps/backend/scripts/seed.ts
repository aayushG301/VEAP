/* Seeds demo accounts, a complete patient profile + QR and the simulated hospital registry. Safe to re-run. */
import { closeDb, connectDb } from "../src/config/db";
import { env } from "../src/config/env";
import { bootstrapAdmin } from "../src/bootstrap";
import { seedDemoData } from "../src/demo/demoSeed";
import { DEMO_STAFF } from "../src/demo/registry";

try { await connectDb(); }
catch (e: any) { console.error(`Cannot connect to MongoDB: ${e?.message}\nStart MongoDB or set MONGO_URI.`); process.exit(1); }
await bootstrapAdmin();
const d = await seedDemoData();
console.log(`\nDemo data ready (password for all demo accounts: ${env.demoPassword})`);
console.log("  admin    admin@veap.demo");
console.log("  patient  patient@veap.demo");
console.log("  doctor   doctor@veap.demo (pending approval: approve it in the admin console)");
console.log(`  QR link  ${d.qrUrl}\n`);
console.log("Simulated hospital registry (Level 3 override):");
for (const s of DEMO_STAFF) console.log(`  ${s.hospitalId}  ${s.staffId}  PIN ${s.pin}  ${s.status.padEnd(9)} ${s.name}`);
console.log();
await closeDb();
