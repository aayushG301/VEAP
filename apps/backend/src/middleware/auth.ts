import type { RequestHandler } from "express";
import { col } from "../config/db";
import { verifyAccessToken } from "../security/tokens";
import { HttpError } from "../utils/http";

export interface AuthUser { id: string; email: string; name: string; role: string; sessionId: string; responderStatus: string | null }
declare module "express-serve-static-core" {
  interface Request { user?: AuthUser }
}

async function loadUser(req: any): Promise<AuthUser | null> {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const claims = verifyAccessToken(h.slice(7));
  if (!claims) return null;
  const s = await col.sessions.findOne({ _id: claims.sid, userId: claims.sub });
  if (!s || s.revoked) return null; // revoked sessions die immediately, not at JWT expiry
  const u = await col.users.findOne({ _id: claims.sub });
  if (!u) return null;
  return { id: u._id, email: u.email, name: u.name, role: u.role, sessionId: claims.sid, responderStatus: u.responderStatus ?? null };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const u = await loadUser(req);
  if (!u) throw new HttpError(401, "unauthorized", "Authentication required");
  req.user = u;
  next();
};
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const u = await loadUser(req);
  if (u) req.user = u;
  next();
};
export const requireRole = (...roles: string[]): RequestHandler => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, "forbidden", "Insufficient permissions"));
  next();
};
/** Anti-CSRF for cookie-authenticated endpoints: SameSite=Strict cookie + a custom header browsers will not send cross-site without CORS preflight. */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.headers["x-requested-with"] !== "veap") return next(new HttpError(403, "csrf", "Missing X-Requested-With header"));
  next();
};
