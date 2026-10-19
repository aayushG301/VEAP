import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message || code);
  }
}
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";
export const userAgent = (req: Request) => String(req.headers["user-agent"] || "").slice(0, 200);
