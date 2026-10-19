import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { getDb } from "./config/db";
import { errorHandler, notFound } from "./middleware/error";
import { authLimiter, globalLimiter } from "./middleware/rateLimit";
import { authRouter } from "./modules/auth/auth.routes";
import { profileRouter } from "./modules/profiles/profile.routes";
import { qrRouter } from "./modules/qr/qr.routes";
import { accessRouter, emergencyRouter } from "./modules/access/access.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { notifyRouter } from "./modules/notifications/notify.routes";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { adminRouter } from "./modules/admin/admin.routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.isProd) app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["\x27none\x27"], frameAncestors: ["\x27none\x27"] } }, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({
    origin: (origin, cb) => (!origin || env.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"))),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Access-Session"],
  }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get("/health", async (_req, res) => { await getDb()!.command({ ping: 1 }); res.json({ status: "ok", time: Date.now() }); });

  const v1 = express.Router();
  v1.use("/auth", authLimiter, authRouter);
  v1.use("/profile", profileRouter);
  v1.use("/qr", qrRouter);
  v1.use("/emergency", emergencyRouter);
  v1.use("/access", accessRouter);
  v1.use("/audit", auditRouter);
  v1.use("/notifications", notifyRouter);
  v1.use("/assistant", assistantRouter);
  v1.use("/admin", adminRouter);
  app.use("/api/v1", v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
