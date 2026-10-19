import { Router } from "express";
import { z } from "zod";
import { scanLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { clientIp } from "../../utils/http";
import { guide, interactions, triage } from "../../services/ml.service";
import { writeAudit } from "../audit/audit.service";
import { fieldsForTier } from "../profiles/profile.service";
import { requireSession, resolveToken } from "../access/access.service";

export const assistantRouter = Router();
assistantRouter.use(scanLimiter);
const tokenField = z.string().min(20).max(80);

assistantRouter.post("/guide", validate(z.object({ token: tokenField, scenario: z.string().trim().min(3).max(500) })), async (req, res) => {
  const t = await resolveToken(req.body.token, req);
  let tier = 1;
  if (req.headers["x-access-session"]) { try { tier = (await requireSession(req, 2, t.id)).tier; } catch { tier = 1; } }
  const d = (await fieldsForTier(t.userId, tier)) as any;
  const out = await guide(req.body.scenario, { allergies: d.allergies || [], medications: d.medications || [], conditions: d.conditions || [] });
  await writeAudit({ userId: t.userId, tokenId: t.id, action: "assistant_used", actor: tier > 1 ? "responder" : "public", tier, ip: clientIp(req) });
  res.json({ ...out, personalizedTier: tier });
});

assistantRouter.post("/triage", validate(z.object({
  symptoms: z.array(z.enum(["unconscious", "not_breathing", "severe_bleeding", "chest_pain", "breathing_difficulty", "stroke_signs", "seizure", "confusion", "fracture", "burn", "allergic_reaction", "abdominal_pain", "fever"])).max(13),
  age: z.number().int().min(0).max(120).optional(), heart_rate: z.number().min(0).max(300).optional(),
  spo2: z.number().min(0).max(100).optional(), systolic_bp: z.number().min(0).max(300).optional(),
})), async (req, res) => { res.json(await triage(req.body)); });

assistantRouter.post("/interactions", validate(z.object({ token: tokenField })), async (req, res) => {
  const t = await resolveToken(req.body.token, req);
  const s = await requireSession(req, 2, t.id);
  const d = (await fieldsForTier(t.userId, s.tier)) as any;
  res.json(await interactions(d.medications || [], d.allergies || []));
});
