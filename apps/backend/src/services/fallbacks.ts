/* Deterministic, offline fallbacks used when the ML service is unreachable. Advisory only. */

export interface ScanFeatures { scans_1m: number; scans_10m: number; distinct_ips_10m: number; failed_otp_ratio: number; night: number }

export function localAnomaly(f: ScanFeatures): { score: number; reasons: string[] } {
  let s = 0; const reasons: string[] = [];
  if (f.scans_1m > 10) { s += 40; reasons.push("high scan velocity"); } else if (f.scans_1m > 5) { s += 20; reasons.push("elevated scan velocity"); }
  if (f.scans_10m > 30) { s += 25; reasons.push("many scans in 10 minutes"); }
  if (f.distinct_ips_10m > 4) { s += 30; reasons.push("many distinct IPs"); } else if (f.distinct_ips_10m > 2) { s += 12; reasons.push("multiple IPs"); }
  if (f.failed_otp_ratio > 0.5) { s += 25; reasons.push("high failed OTP ratio"); }
  return { score: Math.min(100, s), reasons };
}

export const GUIDES: { id: string; title: string; keys: string[]; steps: string[] }[] = [
  { id: "cardiac_arrest", title: "Unresponsive and not breathing normally (suspected cardiac arrest)", keys: ["unconscious", "unresponsive", "not breathing", "cardiac arrest", "no pulse", "collapsed"],
    steps: ["Call your local emergency number now (or ask someone to) and ask for an AED.", "Start chest compressions: heel of hand on the centre of the chest, push hard and fast (about 100-120 per minute, 5-6 cm deep for adults), allow full recoil.", "Use an AED as soon as it arrives and follow its voice prompts.", "Do not stop until professionals take over or the person starts breathing normally."] },
  { id: "heart_attack", title: "Suspected heart attack", keys: ["chest pain", "heart attack", "chest pressure", "left arm pain"],
    steps: ["Call your local emergency number immediately.", "Keep the person seated or semi-reclined, calm and still.", "Loosen tight clothing. Do not let them walk or drive.", "Only give aspirin if the emergency dispatcher advises it AND the person is not allergic and not on blood thinners.", "Be ready to start CPR if they become unresponsive."] },
  { id: "choking", title: "Choking adult (cannot cough, speak or breathe)", keys: ["choking", "choke", "cannot breathe food", "something stuck in throat"],
    steps: ["Ask: are you choking? If they can cough or speak, encourage coughing.", "If they cannot: give up to 5 firm back blows between the shoulder blades.", "Then up to 5 abdominal thrusts (stand behind, fist above navel, pull inwards and upwards).", "Alternate 5 back blows and 5 thrusts. Call emergency services if not cleared.", "If they become unresponsive, start CPR."] },
  { id: "bleeding", title: "Severe bleeding", keys: ["bleeding", "blood loss", "cut", "stab", "wound", "hemorrhage"],
    steps: ["Call your local emergency number for heavy bleeding.", "Apply firm, direct pressure with a clean cloth. Do not remove soaked cloth; add more on top.", "Keep the person lying down and warm. Raise the limb if no fracture is suspected.", "If a limb is bleeding uncontrollably and you are trained, apply a tourniquet above the wound."] },
  { id: "anaphylaxis", title: "Severe allergic reaction (anaphylaxis)", keys: ["allergic", "anaphylaxis", "swelling throat", "hives", "epipen", "sting"],
    steps: ["Call your local emergency number immediately.", "Use an adrenaline (epinephrine) auto-injector if one is available, in the outer mid-thigh.", "Lay the person flat with legs raised (sit up if breathing is difficult).", "A second dose may be given after 5-15 minutes if there is no improvement, per device instructions.", "Be ready to start CPR."] },
  { id: "seizure", title: "Seizure", keys: ["seizure", "convulsion", "fit", "epilepsy"],
    steps: ["Note the time. Move hard or sharp objects away.", "Cushion the head. Do not restrain and do not put anything in the mouth.", "When the shaking stops, place the person on their side (recovery position).", "Call emergency services if it lasts over 5 minutes, repeats, it is a first seizure, there is injury, or breathing does not return to normal."] },
  { id: "stroke", title: "Suspected stroke (FAST)", keys: ["stroke", "face drooping", "slurred speech", "arm weakness"],
    steps: ["Check FAST: Face drooping, Arm weakness, Speech difficulty, Time to call emergency services.", "Note the time symptoms started or when the person was last seen well.", "Keep them still and comfortable. Give nothing to eat or drink and no medication."] },
  { id: "burns", title: "Burn", keys: ["burn", "scald", "fire"],
    steps: ["Cool the burn under cool running water for 20 minutes.", "Remove rings or tight items near the area unless stuck to the skin.", "Cover loosely with clean cling film or a non-fluffy dressing.", "Do not use ice, butter or creams. Seek emergency care for large, deep, facial or chemical burns."] },
  { id: "hypoglycemia", title: "Low blood sugar (diabetic emergency)", keys: ["diabetic", "low blood sugar", "hypoglycemia", "insulin", "sugar low"],
    steps: ["If conscious and able to swallow: give 15-20 g fast sugar (glucose tablets or juice).", "Recheck in 15 minutes and repeat if still unwell.", "If drowsy, unconscious or unable to swallow: give nothing by mouth, place on their side and call emergency services."] },
  { id: "fracture", title: "Suspected fracture", keys: ["fracture", "broken bone", "broken", "fall"],
    steps: ["Keep the injured part still; do not try to straighten it.", "Control any bleeding without pressing on bone.", "Apply a wrapped cold pack. Do not move the person if the neck or back may be injured and call emergency services."] },
  { id: "heat_stroke", title: "Heat stroke", keys: ["heat stroke", "heatstroke", "overheated"],
    steps: ["Call emergency services if confused, unconscious or not sweating.", "Move to a cool place and cool rapidly with water, wet cloths and fanning.", "Give small sips of water only if fully alert."] },
  { id: "poisoning", title: "Suspected poisoning", keys: ["poison", "overdose", "swallowed", "ingested"],
    steps: ["Call emergency services or your local poison centre now.", "Do not induce vomiting.", "Keep the container or substance to show responders and note the amount and time."] },
];

export function localGuide(scenario: string, ctx: { allergies?: string[]; medications?: string[]; conditions?: string[] }) {
  const text = scenario.toLowerCase();
  let best = GUIDES[0]; let bestScore = 0;
  for (const g of GUIDES) { const sc = g.keys.filter((k) => text.includes(k)).length; if (sc > bestScore) { best = g; bestScore = sc; } }
  const warnings = personalWarnings(best.id, ctx);
  return {
    source: "rule-based",
    matched: bestScore > 0,
    title: bestScore > 0 ? best.title : "General emergency guidance",
    steps: bestScore > 0 ? best.steps : ["Check the scene is safe.", "Check responsiveness and breathing.", "Call your local emergency number.", "Follow the dispatcher instructions; start CPR if not breathing normally."],
    warnings,
    disclaimer: "First call your local emergency number. This is general first-aid guidance, not a diagnosis or a substitute for professional care.",
  };
}

const NSAID = ["aspirin", "ibuprofen", "naproxen", "diclofenac", "nsaid"];
const THINNERS = ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "heparin", "clopidogrel", "eliquis", "xarelto"];
const has = (list: string[] | undefined, words: string[]) => (list || []).some((x) => words.some((w) => x.toLowerCase().includes(w)));

export function personalWarnings(guideId: string, ctx: { allergies?: string[]; medications?: string[]; conditions?: string[] }): string[] {
  const w: string[] = [];
  if (has(ctx.allergies, NSAID)) w.push("Patient has a recorded aspirin/NSAID allergy: do NOT give aspirin or NSAIDs.");
  if (has(ctx.medications, THINNERS)) w.push("Patient takes a blood thinner: bleeding may be harder to stop and aspirin/NSAIDs must be avoided. Tell the paramedics.");
  if (has(ctx.medications, ["insulin", "metformin", "glipizide"]) || has(ctx.conditions, ["diabet"])) w.push("Patient has diabetes: consider low blood sugar as a cause of confusion or collapse.");
  if (has(ctx.allergies, ["penicillin", "amoxicillin"])) w.push("Penicillin-class allergy recorded: tell medical staff before any antibiotic is given.");
  if (guideId === "anaphylaxis" && (ctx.allergies || []).length) w.push(`Known allergies: ${(ctx.allergies || []).join(", ")}. Check for exposure.`);
  if (has(ctx.conditions, ["asthma"]) && guideId !== "choking") w.push("Patient has asthma: ask about a reliever inhaler.");
  if (has(ctx.conditions, ["epilep", "seizure"])) w.push("Patient has epilepsy: seizures may be their known condition; still call for help if prolonged.");
  return w;
}

export const RULES: { a: string[]; b: string[]; level: "high" | "moderate"; msg: string; aKind: "allergy" | "med" }[] = [
  { a: ["penicillin", "amoxicillin", "ampicillin"], b: ["penicillin", "amoxicillin", "ampicillin", "augmentin", "cloxacillin"], level: "high", msg: "Penicillin-class allergy: avoid penicillin antibiotics.", aKind: "allergy" },
  { a: ["aspirin", "nsaid", "ibuprofen"], b: ["aspirin", "ibuprofen", "naproxen", "diclofenac", "ketorolac"], level: "high", msg: "NSAID/aspirin allergy: avoid all NSAIDs.", aKind: "allergy" },
  { a: ["sulfa", "sulfonamide"], b: ["sulfamethoxazole", "cotrimoxazole", "bactrim"], level: "high", msg: "Sulfa allergy: avoid sulfonamide antibiotics.", aKind: "allergy" },
  { a: ["latex"], b: ["latex"], level: "moderate", msg: "Latex allergy: use latex-free gloves and equipment.", aKind: "allergy" },
];
export const MED_RULES: { a: string[]; b: string[]; level: "high" | "moderate"; msg: string }[] = [
  { a: THINNERS, b: NSAID, level: "high", msg: "Anticoagulant plus NSAID/aspirin: major bleeding risk." },
  { a: ["warfarin"], b: ["amiodarone", "fluconazole", "metronidazole"], level: "moderate", msg: "Warfarin interaction: INR may rise; monitor bleeding." },
  { a: ["insulin"], b: ["propranolol", "metoprolol", "atenolol"], level: "moderate", msg: "Beta-blocker may mask symptoms of low blood sugar in insulin users." },
  { a: ["sildenafil", "tadalafil"], b: ["nitroglycerin", "isosorbide"], level: "high", msg: "PDE5 inhibitor plus nitrate: severe hypotension. Do NOT give nitrates." },
  { a: ["ssri", "sertraline", "fluoxetine", "citalopram"], b: ["tramadol", "linezolid"], level: "moderate", msg: "Risk of serotonin syndrome." },
];
const hit = (list: string[], words: string[]) => list.filter((x) => words.some((w) => x.toLowerCase().includes(w)));

export function localInteractions(meds: string[], allergies: string[]) {
  const out: { level: string; message: string; items: string[] }[] = [];
  for (const r of RULES) {
    const aHits = hit(allergies, r.a); const bHits = hit(meds, r.b);
    if (aHits.length && bHits.length) out.push({ level: r.level, message: `${r.msg} Patient takes: ${bHits.join(", ")}.`, items: [...aHits, ...bHits] });
  }
  for (const r of MED_RULES) {
    const aHits = hit(meds, r.a); const bHits = hit(meds, r.b);
    if (aHits.length && bHits.length) out.push({ level: r.level, message: r.msg, items: [...aHits, ...bHits] });
  }
  return out;
}

export function localTriage(i: { age?: number; symptoms: string[]; heart_rate?: number; spo2?: number; systolic_bp?: number }) {
  const s = new Set(i.symptoms.map((x) => x.toLowerCase()));
  let score = 0; const factors: string[] = [];
  const add = (c: boolean, p: number, f: string) => { if (c) { score += p; factors.push(f); } };
  add(s.has("unconscious"), 100, "unconscious"); add(s.has("not_breathing"), 100, "not breathing");
  add(s.has("severe_bleeding"), 60, "severe bleeding"); add(s.has("chest_pain"), 45, "chest pain");
  add(s.has("breathing_difficulty"), 50, "breathing difficulty"); add(s.has("stroke_signs"), 55, "stroke signs");
  add(s.has("seizure"), 40, "seizure"); add(s.has("confusion"), 25, "confusion"); add(s.has("fracture"), 15, "possible fracture");
  add((i.spo2 ?? 100) < 90, 40, "low oxygen saturation"); add((i.heart_rate ?? 80) > 130 || (i.heart_rate ?? 80) < 45, 25, "abnormal heart rate");
  add((i.systolic_bp ?? 120) < 90, 35, "low blood pressure"); add((i.age ?? 30) > 75 || (i.age ?? 30) < 2, 10, "age risk");
  const level = score >= 90 ? "CRITICAL" : score >= 45 ? "HIGH" : score >= 20 ? "MODERATE" : "LOW";
  return { source: "rule-based", level, score: Math.min(100, score), factors, disclaimer: "Decision support only. Always call emergency services for serious symptoms." };
}
