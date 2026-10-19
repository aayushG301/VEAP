import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ageFrom } from "../../lib/util";
import { TagInput } from "../../components/TagInput";
import { VisibilityPicker } from "../../components/VisibilityPicker";
import { useToast } from "../../components/Toast";

const BLOOD = ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ALLERGY_HINTS = ["Penicillin", "Peanuts", "Latex", "Aspirin", "Sulfa drugs", "Shellfish", "Bee stings", "Ibuprofen"];
const CONDITION_HINTS = ["Type 1 diabetes", "Type 2 diabetes", "Asthma", "Epilepsy", "Hypertension", "Heart disease", "Pregnancy"];
const MED_HINTS = ["Insulin", "Metformin", "Warfarin", "Aspirin", "Salbutamol inhaler", "Atorvastatin"];
const emptyContact = { name: "", phone: "", relationship: "" };

interface Form { fullName: string; dateOfBirth: string; bloodGroup: string; organDonor: boolean; allergies: string[]; conditions: string[]; medications: string[]; implants: string[];
  emergencyInstructions: string; contacts: { name: string; phone: string; relationship: string }[]; doctor: { name: string; phone: string; hospital: string }; insurance: string; notes: string }
const blank: Form = { fullName: "", dateOfBirth: "", bloodGroup: "Unknown", organDonor: false, allergies: [], conditions: [], medications: [], implants: [], emergencyInstructions: "", contacts: [{ ...emptyContact }], doctor: { name: "", phone: "", hospital: "" }, insurance: "", notes: "" };

function SectionHead({ icon, title, field, vis, setVis }: { icon: string; title: string; field: string; vis: Record<string, number>; setVis: (v: Record<string, number>) => void }) {
  return (
    <div className="card__title">
      <span aria-hidden>{icon}</span>{title}<span className="spacer" />
      <VisibilityPicker label={title} value={vis[field] ?? 3} onChange={(t) => setVis({ ...vis, [field]: t })} />
    </div>
  );
}

export default function ProfileTab({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<Form>(blank);
  const [vis, setVis] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState("");
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [err, setErr] = useState("");

  const hydrate = (r: any) => {
    const p = r.profile || {};
    const next: Form = { fullName: p.fullName || "", dateOfBirth: p.dateOfBirth || "", bloodGroup: p.bloodGroup || "Unknown", organDonor: !!p.organDonor, allergies: p.allergies || [], conditions: p.conditions || [], medications: p.medications || [], implants: p.implants || [],
      emergencyInstructions: p.emergencyInstructions || "", contacts: p.emergencyContacts?.length ? p.emergencyContacts : [{ ...emptyContact }], doctor: p.doctor || { name: "", phone: "", hospital: "" }, insurance: p.insurance || "", notes: p.notes || "" };
    setF(next); setVis(r.visibility || {}); setScore(r.completeness || 0);
    setSnapshot(JSON.stringify({ f: next, v: r.visibility || {} }));
  };
  useEffect(() => { api("/profile").then(hydrate).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, []);
  const dirty = !loading && JSON.stringify({ f, v: vis }) !== snapshot;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault(); setErr(""); setSaving(true);
    try {
      const body: any = { fullName: f.fullName, bloodGroup: f.bloodGroup, organDonor: f.organDonor, allergies: f.allergies, conditions: f.conditions, medications: f.medications, implants: f.implants,
        emergencyContacts: f.contacts.filter((c) => c.name || c.phone), doctor: f.doctor };
      if (f.dateOfBirth) body.dateOfBirth = f.dateOfBirth; if (f.insurance) body.insurance = f.insurance; if (f.notes) body.notes = f.notes; if (f.emergencyInstructions) body.emergencyInstructions = f.emergencyInstructions;
      await api("/profile", { method: "PUT", body });
      hydrate(await api("/profile/visibility", { method: "PUT", body: { visibility: vis } }));
      toast("Profile saved and encrypted ✔", "success"); onSaved?.();
    } catch (e: any) { setErr(e.message); toast(e.message, "error"); } finally { setSaving(false); }
  };
  const setContact = (i: number, k: string, v: string) => setF({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });

  // What a stranger scanning the QR would see right now (before saving), based on the visibility choices
  const preview = useMemo(() => {
    const show = (k: string) => (vis[k] ?? 3) <= 1;
    const rows: [string, string][] = [];
    if (show("fullName") && f.fullName) rows.push(["Name", f.fullName]);
    if (show("bloodGroup") && f.bloodGroup !== "Unknown") rows.push(["Blood group", f.bloodGroup]);
    if (show("allergies") && f.allergies.length) rows.push(["Allergies", f.allergies.join(", ")]);
    if (show("conditions") && f.conditions.length) rows.push(["Conditions", f.conditions.join(", ")]);
    if (show("medications") && f.medications.length) rows.push(["Medications", f.medications.join(", ")]);
    if (show("emergencyInstructions") && f.emergencyInstructions) rows.push(["Instructions", f.emergencyInstructions]);
    if (show("emergencyContacts") && f.contacts[0]?.name) rows.push(["Contact", `${f.contacts[0].name} ${f.contacts[0].phone}`]);
    if (show("dateOfBirth") && ageFrom(f.dateOfBirth) !== null) rows.push(["Age", String(ageFrom(f.dateOfBirth))]);
    return rows;
  }, [f, vis]);

  if (loading) return <div className="stack"><div className="skeleton" style={{ height: 110 }} /><div className="skeleton" style={{ height: 220 }} /></div>;

  return (
    <form onSubmit={save} aria-label="profile form" className="split">
      <div>
        <div className="card card--info card--tight mb-md">
          <div className="text-sm" style={{ color: "var(--text-primary)" }}><b>Who can see what?</b> Use the switch on each section.</div>
          <div className="row mt-sm text-xs">
            <span className="badge badge--safe">🌐 Public: anyone who scans</span>
            <span className="badge badge--warn">🔐 Verified: code from your contact</span>
            <span className="badge badge--danger">🔒 Restricted: professional or override</span>
          </div>
        </div>

        <div className="card mb-md">
          <SectionHead icon="🧑" title="Personal information" field="fullName" vis={vis} setVis={setVis} />
          <div className="form-group"><label className="form-label" htmlFor="fn">Full name</label><input id="fn" className="form-input" required placeholder="e.g. Aayush Kumar" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div className="grid grid--2">
            <div className="form-group">
              <div className="row row--between"><label className="form-label" htmlFor="dob">Date of birth</label><VisibilityPicker label="date of birth" value={vis.dateOfBirth ?? 3} onChange={(t) => setVis({ ...vis, dateOfBirth: t })} /></div>
              <input id="dob" className="form-input" type="date" value={f.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} /></div>
            <div className="form-group">
              <div className="row row--between"><label className="form-label" htmlFor="bg">Blood group</label><VisibilityPicker label="blood group" value={vis.bloodGroup ?? 3} onChange={(t) => setVis({ ...vis, bloodGroup: t })} /></div>
              <select id="bg" className="form-select" value={f.bloodGroup} onChange={(e) => setF({ ...f, bloodGroup: e.target.value })}>{BLOOD.map((b) => <option key={b} value={b}>{b === "Unknown" ? "Select blood group" : b}</option>)}</select></div>
          </div>
          <div className="row row--between"><label className="check"><input type="checkbox" checked={f.organDonor} onChange={(e) => setF({ ...f, organDonor: e.target.checked })} /> I am an organ donor</label>
            <VisibilityPicker label="organ donor" value={vis.organDonor ?? 3} onChange={(t) => setVis({ ...vis, organDonor: t })} /></div>
        </div>

        <div className="card mb-md">
          <div className="card__title"><span aria-hidden>🩺</span>Medical information</div>
          <div className="row row--between mb-sm"><span className="text-sm">Allergies</span><VisibilityPicker label="allergies" value={vis.allergies ?? 3} onChange={(t) => setVis({ ...vis, allergies: t })} /></div>
          <TagInput label="Allergies" id="allergies" value={f.allergies} onChange={(v) => setF({ ...f, allergies: v })} variant="red" placeholder="e.g. Penicillin, Peanuts" suggestions={ALLERGY_HINTS} />
          <div className="row row--between mb-sm"><span className="text-sm">Critical conditions</span><VisibilityPicker label="conditions" value={vis.conditions ?? 3} onChange={(t) => setVis({ ...vis, conditions: t })} /></div>
          <TagInput label="Critical conditions" id="conditions" value={f.conditions} onChange={(v) => setF({ ...f, conditions: v })} placeholder="e.g. Diabetic, Asthma" suggestions={CONDITION_HINTS} />
          <div className="row row--between mb-sm"><span className="text-sm">Current medications</span><VisibilityPicker label="medications" value={vis.medications ?? 3} onChange={(t) => setVis({ ...vis, medications: t })} /></div>
          <TagInput label="Current medications" id="medications" value={f.medications} onChange={(v) => setF({ ...f, medications: v })} variant="blue" placeholder="e.g. Insulin, Warfarin 5mg" suggestions={MED_HINTS} max={40} />
          <div className="row row--between mb-sm"><span className="text-sm">Implants & devices</span><VisibilityPicker label="implants" value={vis.implants ?? 3} onChange={(t) => setVis({ ...vis, implants: t })} /></div>
          <TagInput label="Implants & devices" id="implants" value={f.implants} onChange={(v) => setF({ ...f, implants: v })} variant="purple" placeholder="e.g. Pacemaker" max={15} />
        </div>

        <div className="card card--danger mb-md">
          <SectionHead icon="⚠️" title="Emergency instructions" field="emergencyInstructions" vis={vis} setVis={setVis} />
          <textarea id="emergencyInstructions" aria-label="Emergency instructions" className="form-textarea" maxLength={500} placeholder="e.g. I carry an EpiPen in my left pocket. I am on blood thinners." value={f.emergencyInstructions} onChange={(e) => setF({ ...f, emergencyInstructions: e.target.value })} />
          <div className="form-hint">Shown prominently to responders. {f.emergencyInstructions.length}/500</div>
        </div>

        <div className="card mb-md">
          <SectionHead icon="📞" title="Emergency contacts" field="emergencyContacts" vis={vis} setVis={setVis} />
          <p className="text-xs text-muted mb-sm">The first contact is your <b>primary contact</b>: when a responder asks for Level 2 access, the verification code is sent to this person.</p>
          {f.contacts.map((c, i) => (
            <div key={i} className="grid grid--3 mb-sm" style={{ alignItems: "end" }}>
              <div><label className="form-label" htmlFor={`cn${i}`}>{i === 0 ? "Primary contact" : "Name"}</label><input id={`cn${i}`} className="form-input" placeholder="Name" value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} /></div>
              <div><label className="form-label" htmlFor={`cp${i}`}>Phone</label><input id={`cp${i}`} className="form-input" inputMode="tel" placeholder="+91 98765 43210" value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} /></div>
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}><label className="form-label" htmlFor={`cr${i}`}>Relationship</label><input id={`cr${i}`} className="form-input" placeholder="e.g. Brother" value={c.relationship} onChange={(e) => setContact(i, "relationship", e.target.value)} /></div>
                {f.contacts.length > 1 && <button type="button" className="btn btn--ghost btn--sm" aria-label={`Remove contact ${i + 1}`} style={{ minHeight: 46 }} onClick={() => setF({ ...f, contacts: f.contacts.filter((_, j) => j !== i) })}>🗑</button>}
              </div>
            </div>
          ))}
          {f.contacts.length < 5 && <button type="button" className="btn btn--ghost btn--sm btn--full mt-sm" onClick={() => setF({ ...f, contacts: [...f.contacts, { ...emptyContact }] })}>+ Add emergency contact</button>}
        </div>

        <div className="card mb-md">
          <SectionHead icon="🏥" title="Doctor & hospital" field="doctor" vis={vis} setVis={setVis} />
          <div className="grid grid--3">
            {(["name", "phone", "hospital"] as const).map((k) => <div className="form-group" key={k}><label className="form-label" htmlFor={`d${k}`}>{k}</label><input id={`d${k}`} className="form-input" value={f.doctor[k] || ""} onChange={(e) => setF({ ...f, doctor: { ...f.doctor, [k]: e.target.value } })} /></div>)}
          </div>
        </div>

        <div className="card mb-md">
          <div className="card__title"><span aria-hidden>📋</span>Insurance & medical history</div>
          <div className="row row--between"><label className="form-label" htmlFor="ins">Insurance</label><VisibilityPicker label="insurance" value={vis.insurance ?? 3} onChange={(t) => setVis({ ...vis, insurance: t })} /></div>
          <input id="ins" className="form-input mb-md" placeholder="Provider and policy number" value={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.value })} />
          <div className="row row--between mt-md"><label className="form-label" htmlFor="notes">Medical history & notes</label><VisibilityPicker label="notes" value={vis.notes ?? 3} onChange={(t) => setVis({ ...vis, notes: t })} /></div>
          <textarea id="notes" className="form-textarea" maxLength={2000} placeholder="Previous surgeries, chronic conditions..." value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="savebar" aria-live="polite">
          <span className="text-sm" style={{ color: dirty ? "var(--warning-amber)" : "var(--text-muted)" }}>{dirty ? "● Unsaved changes" : "✓ All changes saved"}</span>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={saving || !dirty}>{saving ? <span className="spinner" /> : "💾 Save profile"}</button>
        </div>
      </div>

      <aside className="stack" style={{ position: "sticky", top: "calc(var(--nav-h) + 12px)" }}>
        <div className="card">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <div className="ring" style={{ ["--p" as any]: score }}><span>{score}%</span></div>
            <div><b>Profile completeness</b><p className="text-sm">{score >= 80 ? "Great, responders have what they need." : "Add blood group, allergies and a contact to reach 100%."}</p></div>
          </div>
        </div>
        <div className="card card--success">
          <div className="card__title">👀 What a stranger sees</div>
          <p className="text-xs text-muted mb-sm">Live preview of Level 1 (public), based on your settings.</p>
          {preview.length === 0 ? <div className="empty">Nothing is public yet.</div> : (
            <dl className="data-list">{preview.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>)}
        </div>
      </aside>
    </form>
  );
}
