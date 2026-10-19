import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const make = (limit: number, windowMs: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited", message } });

export const globalLimiter = make(env.rateLimit.global, 15 * 60_000, "Too many requests, slow down.");
export const authLimiter = make(env.rateLimit.auth, 15 * 60_000, "Too many authentication attempts. Try again later.");
export const scanLimiter = make(env.rateLimit.scan, 60_000, "Too many scans from this address.");
export const otpLimiter = make(env.rateLimit.otp, 15 * 60_000, "Too many OTP requests. Try again later.");
