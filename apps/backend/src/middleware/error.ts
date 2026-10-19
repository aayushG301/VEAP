import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../utils/http";
import { env } from "../config/env";

export const notFound: RequestHandler = (_req, res) => { res.status(404).json({ error: "not_found", message: "Route not found" }); };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...(err.extra || {}) });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "bad_json", message: "Malformed JSON" });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "too_large", message: "Payload too large" });
  if (!env.isTest) console.error("[error]", err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
};
