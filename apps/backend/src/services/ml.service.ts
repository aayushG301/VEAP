import { env } from "../config/env";
import { localAnomaly, localGuide, localInteractions, localTriage, type ScanFeatures } from "./fallbacks";

async function callMl<T>(path: string, body: unknown): Promise<T | null> {
  if (!env.mlServiceUrl) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${env.mlServiceUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-service-key": env.mlServiceKey }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function scoreScan(f: ScanFeatures): Promise<{ score: number; reasons: string[]; source: string }> {
  const r = await callMl<{ score: number; reasons: string[] }>("/anomaly/score", f);
  if (r) return { ...r, source: "ml" };
  return { ...localAnomaly(f), source: "rule-based" };
}
export async function guide(scenario: string, ctx: any) {
  const r = await callMl<any>("/assistant/guide", { scenario, context: ctx });
  return r ?? localGuide(scenario, ctx);
}
export async function triage(input: any) {
  const r = await callMl<any>("/triage/predict", input);
  return r ?? localTriage(input);
}
export async function interactions(meds: string[], allergies: string[]) {
  const r = await callMl<any>("/interactions/check", { medications: meds, allergies });
  return { source: r ? "ml" : "rule-based", warnings: r ? r.warnings : localInteractions(meds, allergies) };
}
