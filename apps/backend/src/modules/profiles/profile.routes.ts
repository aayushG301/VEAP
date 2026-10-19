import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { clientIp } from "../../utils/http";
import { writeAudit } from "../audit/audit.service";
import { profileSchema, visibilitySchema, FIELDS } from "./profile.schema";
import { completeness, loadProfile, saveProfile, saveVisibility } from "./profile.service";

export const profileRouter = Router();
profileRouter.use(requireAuth, requireRole("patient"));

const view = async (userId: string) => {
  const { profile, visibility, updatedAt } = await loadProfile(userId);
  return { profile, visibility, updatedAt, completeness: completeness(profile), fields: FIELDS };
};

profileRouter.get("/", async (req, res) => { res.json(await view(req.user!.id)); });

profileRouter.put("/", validate(profileSchema), async (req, res) => {
  await saveProfile(req.user!.id, req.body);
  await writeAudit({ userId: req.user!.id, action: "profile_updated", actor: "self", ip: clientIp(req) });
  res.json(await view(req.user!.id));
});

profileRouter.put("/visibility", validate(z.object({ visibility: visibilitySchema })), async (req, res) => {
  await saveVisibility(req.user!.id, req.body.visibility);
  await writeAudit({ userId: req.user!.id, action: "visibility_updated", actor: "self", ip: clientIp(req), meta: req.body.visibility });
  res.json(await view(req.user!.id));
});
