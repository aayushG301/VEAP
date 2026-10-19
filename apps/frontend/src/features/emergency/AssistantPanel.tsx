import { useState } from "react";
import { api } from "../../lib/api";

const TYPES: [string, string, string][] = [
  ["❤️", "Heart attack", "crushing chest pain and left arm pain"], ["🫁", "Not breathing", "unconscious and not breathing, no pulse"], ["🩸", "Severe bleeding", "severe bleeding from a deep cut"], ["🍽️", "Choking", "choking and cannot breathe"],
  ["⚡", "Seizure", "person is having a seizure"], ["🐝", "Allergic reaction", "severe allergic reaction with swelling throat"], ["🧠", "Stroke", "stroke: face drooping and slurred speech"], ["🔥", "Burn", "burn injury"],
  ["🍬", "Low blood sugar", "diabetic with low blood sugar, confused"], ["🦴", "Broken bone", "suspected fracture after a fall"], ["🥵", "Heat stroke", "heat stroke, overheated and confused"], ["☠️", "Poisoning", "swallowed poison or overdose"],
];
const SYMPTOMS: [string, string][] = [["unconscious", "Unconscious"], ["not_breathing", "Not breathing"], ["severe_bleeding", "Severe bleeding"], ["chest_pain", "Chest pain"], ["breathing_difficulty", "Breathing difficulty"], ["stroke_signs", "Stroke signs"], ["seizure", "Seizure"], ["confusion", "Confusion"], ["fracture", "Fracture"], ["burn", "Burn"], ["allergic_reaction", "Allergic reaction"], ["fever", "Fever"]];
const levelBadge: Record<string, string> = { LOW: "badge--safe", MODERATE: "badge--warn", HIGH: "badge--danger", CRITICAL: "badge--danger" };

export default function AssistantPanel({ token, session }: { token: string; session: string | null }) {
  const [q, setQ] = useState(""); const [active, setActive] = useState(""); const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [more, setMore] = useState(false);
  const [sym, setSym] = useState<string[]>([]); const [age, setAge] = useState(""); const [tri, setTri] = useState<any>(null);

  const ask = async (text: string, label = "") => {
    if (text.trim().length < 3) return;
    setBusy(true); setErr(""); setActive(label);
    try { setOut(await api("/assistant/guide", { auth: false, session, body: { token, scenario: text } })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const speak = () => {
    if (!out || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = [out.disclaimer, out.title, ...(out.warnings || []), ...out.steps.map((s: string, i: number) => `Step ${i + 1}. ${s}`)].join(" ");
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };
  const triage = async () => {
    setErr("");
    try { setTri(await api("/assistant/triage", { auth: false, body: { symptoms: sym, ...(age ? { age: Number(age) } : {}) } })); } catch (e: any) { setErr(e.message); }
  };
  const shown = more ? TYPES : TYPES.slice(0, 8);

  return (
    <section aria-labelledby="ai-title">
      <h2 className="section-title" id="ai-title">🤖 AI emergency assistant</h2>
      <p className="text-sm mb-md">Call your local emergency number first. Tap what is happening for step-by-step help{session ? ", personalised with the verified patient data" : ". Verify below to personalise it with allergies and medications"}.</p>
      <div className="emergency-type-grid">
        {shown.map(([icon, label, scenario]) => (
          <button key={label} type="button" className={`emergency-type-btn ${active === label ? "active" : ""}`} onClick={() => { setQ(scenario); ask(scenario, label); }} disabled={busy}>
            <span className="emergency-type-btn__icon" aria-hidden>{icon}</span>{label}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm mb-md" onClick={() => setMore(!more)}>{more ? "Show fewer" : "More emergencies"}</button>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input aria-label="Describe the emergency" className="form-input" placeholder="Or describe what is happening..." value={q} maxLength={500} onChange={(e) => { setQ(e.target.value); setActive(""); }} onKeyDown={(e) => e.key === "Enter" && ask(q)} />
        <button className="btn btn--primary" disabled={busy || q.trim().length < 3} onClick={() => ask(q)}>{busy ? <span className="spinner" /> : "Get help"}</button>
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {out && (
        <div className="ai-panel mt-md animate-in" aria-live="polite">
          <div className="ai-panel__header">🤖 {out.title}<span className="spacer" /><span className="badge">{out.source}</span><button className="btn btn--ghost btn--sm" onClick={speak}>🔊 Read aloud</button></div>
          <div className="ai-warning" style={{ background: "rgba(239,68,68,.15)", fontWeight: 600 }}>📞 {out.disclaimer}</div>
          {(out.warnings || []).map((w: string) => <div key={w} className="ai-warning">⚠️ <span><b>This patient:</b> {w}</span></div>)}
          <ol className="ai-steps">{out.steps.map((s: string) => <li key={s}>{s}</li>)}</ol>
          {!out.matched && <p className="text-xs text-muted mt-md">I couldn't match that exactly, so here is general guidance. Try picking one of the buttons above.</p>}
        </div>
      )}
      <details className="card card--tight mt-md">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>🩺 Quick triage (decision support)</summary>
        <div className="row mt-md">{SYMPTOMS.map(([k, l]) => <label key={k} className="check text-sm"><input type="checkbox" checked={sym.includes(k)} onChange={(e) => setSym(e.target.checked ? [...sym, k] : sym.filter((x) => x !== k))} /> {l}</label>)}</div>
        <div className="row mt-md"><input aria-label="Age" className="form-input" style={{ maxWidth: 140 }} placeholder="Age (optional)" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} /><button className="btn btn--primary btn--sm" onClick={triage}>Assess urgency</button></div>
        {tri && <div className="mt-md" role="status"><span className={`badge ${levelBadge[tri.level]}`}>Urgency: {tri.level}</span> {tri.factors?.length ? <span className="text-sm text-muted">Factors: {tri.factors.join(", ")}</span> : null}<p className="text-xs text-muted mt-sm">{tri.disclaimer}</p></div>}
      </details>
    </section>
  );
}
