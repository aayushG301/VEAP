import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "../utils/http";

export const validate = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    return next(new HttpError(400, "validation_error", "Invalid input", { issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }));
  }
  req.body = r.data;
  next();
};
