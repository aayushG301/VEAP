import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ageFrom } from "../../lib/util";
import { TagInput } from "../../components/TagInput";
import { VisibilityPicker } from "../../components/VisibilityPicker";
import { RowsEditor, type Row } from "../../components/RowsEditor";
import { useToast } from "../../components/Toast";

const BLOOD = ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ALLERGY_HINTS = ["Penicillin", "Peanuts", "Latex", "Aspirin", "Sulfa drugs", "Shellfish", "Bee stings", "Ibuprofen"];
const CONDITION_HINTS = ["Type 1 diabetes", "Type 2 diabetes", "Asthma", "Epilepsy", "Hypertension", "Heart disease", "Pregnancy"];
const MED_HINTS = ["Insulin", "Metformin", "Warfarin", "Aspirin", "Salbutamol inhaler", "Atorvastatin"];
const emptyContact = { name: "", phone: "", relationship: "" };

const SEVERITY = ["mild", "moderate", "severe", "life-threatening"]; const MRI = ["unknown", "safe", "conditional", "unsafe"];
const YNU = ["unknown", "no", "yes"]; const TRANSFUSION = ["unknown", "accepts", "refuses"];
interface Extra { prescriptions: Row[]; allergyDetails: Row[]; surgeries: Row[]; vaccinations: Row[]; implantDetails: Row[]; specialists: Row[];
  directives: { dnr: string; transfusion: string; otherWishes: string }; prefHospital: { name: string; phone: string }; insuranceDetails: { provider: string; policyNumber: string; tpaHelpline: string };
  lastVerifiedAt: string; confirmCurrent: boolean }
const blankExtra: Extra = { prescriptions: [], allergyDetails: [], surgeries: [], vaccinations: [], implantDetails: [], specialists: [], directives: { dnr: "unknown", transfusion: "unknown", otherWishes: "" },
  prefHospital: { name: "", phone: "" }, insuranceDetails: { provider: "", policyNumber: "", tpaHelpline: "" }, lastVerifiedAt: "", confirmCurrent: false };
const extraFrom = (p: any): Extra => ({ prescriptions: p.prescriptions || [], allergyDetails: p.allergyDetails || [], surgeries: p.surgeries || [], vaccinations: p.vaccinations || [], implantDetails: p.implantDetails || [], specialists: p.specialists || [],
  directives: { ...blankExtra.directives, ...(p.advanceDirectives || {}) }, prefHospital: { ...blankExtra.prefHospital, ...(p.preferredHospital || {}) }, insuranceDetails: { ...blankExtra.insuranceDetails, ...(p.insuranceDetails || {}) },
  lastVerifiedAt: p.lastVerifiedAt || "", confirmCurrent: false });
const cleanRows = (r: Row[], key: string) => r.filter((x) => (x[key] || "").trim()).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, (v || "").trim()])));
interface Form extends Extra { fullName: string; dateOfBirth: string; bloodGroup: string; organDonor: boolean; allergies: string[]; conditions: string[]; medications: string[]; implants: string[];
  emergencyInstructions: string; contacts: { name: string; phone: string; relationship: string }[]; doctor: { name: string; phone: string; hospital: string }; insurance: string; notes: string }
const blank: Form = { fullName: "", dateOfBirth: "", bloodGroup: "Unknown", organDonor: false, allergies: [], conditions: [], medications: [], implants: [], emergencyInstructions: "", contacts: [{ ...emptyContact }], doctor: { name: "", phone: "", hospital: "" }, insurance: "", notes: "", ...blankExtra };

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
      emergencyInstructions: p.emergencyInstructions || "", contacts: p.emergencyContacts?.length ? p.emergencyContacts : [{ ...emptyContact }], doctor: p.doctor || { name: "", phone: "", hospital: "" }, insurance: p.insurance || "", notes: p.notes || "", ...extraFrom(p) };
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
      body.prescriptions = cleanRows(f.prescriptions, "drug"); body.allergyDetails = cleanRows(f.allergyDetails, "allergen"); body.surgeries = cleanRows(f.surgeries, "procedure");
      body.vaccinations = cleanRows(f.vaccinations, "name"); body.implantDetails = cleanRows(f.implantDetails, "device"); body.specialists = cleanRows(f.specialists, "name");
      const d = f.directives; if (d.dnr !== "unknown" || d.transfusion !== "unknown" || d.otherWishes.trim()) body.advanceDirectives = { dnr: d.dnr, transfusion: d.transfusion, otherWishes: d.otherWishes.trim() || undefined };
      if (f.prefHospital.name.trim() || f.prefHospital.phone.trim()) body.preferredHospital = { name: f.prefHospital.name.trim(), phone: f.prefHospital.phone.trim() };
      if (Object.values(f.insuranceDetails).some((v) => v.trim())) body.insuranceDetails = Object.fromEntries(Object.entries(f.insuranceDetails).map(([k, v]) => [k, v.trim()]));
      if (f.confirmCurrent) body.confirmCurrent = true;
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
          <div className="card__title"><span aria-hidden>🧾</span>Detailed medical record</div>
          <p className="text-xs text-muted mb-md">The extra detail hospital teams ask for. Each block has its own switch; by default prescriptions and allergy reactions are <b>Verified</b> and the rest is <b>Restricted</b> (hospital-staff override only).</p>

          <div className="row row--between mb-sm"><span className="text-sm">💊 Prescriptions (dose, frequency, prescriber)</span><VisibilityPicker label="prescriptions" value={vis.prescriptions ?? 2} onChange={(t) => setVis({ ...vis, prescriptions: t })} /></div>
          <RowsEditor id="rx" label="Prescription" rows={f.prescriptions} onChange={(prescriptions) => setF({ ...f, prescriptions })} addLabel="Add prescription" max={20}
            cols={[{ key: "drug", label: "Medicine", placeholder: "Warfarin", grow: 2 }, { key: "dose", label: "Dose", placeholder: "5 mg" }, { key: "frequency", label: "Frequency", placeholder: "Once daily" }, { key: "prescriber", label: "Prescribed by", placeholder: "Dr. Rao", grow: 2 }]} />

          <div className="row row--between mb-sm"><span className="text-sm">🚨 Allergy reactions & severity</span><VisibilityPicker label="allergy details" value={vis.allergyDetails ?? 2} onChange={(t) => setVis({ ...vis, allergyDetails: t })} /></div>
          <RowsEditor id="alg" label="Allergy" rows={f.allergyDetails} onChange={(allergyDetails) => setF({ ...f, allergyDetails })} addLabel="Add allergy detail" max={20}
            cols={[{ key: "allergen", label: "Allergen", placeholder: "Penicillin", grow: 2 }, { key: "reaction", label: "Reaction", placeholder: "Hives, swelling", grow: 2 }, { key: "severity", label: "Severity", options: SEVERITY }]} />

          <div className="row row--between mb-sm"><span className="text-sm">🔪 Surgical & hospital history</span><VisibilityPicker label="surgeries" value={vis.surgeries ?? 3} onChange={(t) => setVis({ ...vis, surgeries: t })} /></div>
          <RowsEditor id="surg" label="Surgery" rows={f.surgeries} onChange={(surgeries) => setF({ ...f, surgeries })} addLabel="Add surgery / admission" max={20}
            cols={[{ key: "procedure", label: "Procedure", placeholder: "Appendectomy", grow: 2 }, { key: "year", label: "Year", placeholder: "2019" }, { key: "hospital", label: "Hospital", placeholder: "City Hospital", grow: 2 }]} />

          <div className="row row--between mb-sm"><span className="text-sm">💉 Vaccinations (e.g. tetanus date)</span><VisibilityPicker label="vaccinations" value={vis.vaccinations ?? 3} onChange={(t) => setVis({ ...vis, vaccinations: t })} /></div>
          <RowsEditor id="vax" label="Vaccination" rows={f.vaccinations} onChange={(vaccinations) => setF({ ...f, vaccinations })} addLabel="Add vaccination" max={20}
            cols={[{ key: "name", label: "Vaccine", placeholder: "Tetanus booster", grow: 2 }, { key: "date", label: "Date", placeholder: "2024-02-10" }]} />

          <div className="row row--between mb-sm"><span className="text-sm">🫀 Implant details & MRI safety</span><VisibilityPicker label="implant details" value={vis.implantDetails ?? 3} onChange={(t) => setVis({ ...vis, implantDetails: t })} /></div>
          <RowsEditor id="imp" label="Implant" rows={f.implantDetails} onChange={(implantDetails) => setF({ ...f, implantDetails })} addLabel="Add implant" max={15}
            cols={[{ key: "device", label: "Device", placeholder: "Pacemaker (model)", grow: 2 }, { key: "implantedYear", label: "Year", placeholder: "2021" }, { key: "mriSafety", label: "MRI safety", options: MRI }]} />

          <div className="row row--between mb-sm"><span className="text-sm">📜 Advance directives & preferences</span><VisibilityPicker label="advance directives" value={vis.advanceDirectives ?? 3} onChange={(t) => setVis({ ...vis, advanceDirectives: t })} /></div>
          <div className="grid grid--2 mb-sm">
            <div className="form-group"><label className="form-label" htmlFor="dnr">Do-not-resuscitate (DNR)</label><select id="dnr" className="form-select" value={f.directives.dnr} onChange={(e) => setF({ ...f, directives: { ...f.directives, dnr: e.target.value } })}>{YNU.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
            <div className="form-group"><label className="form-label" htmlFor="trf">Blood transfusion</label><select id="trf" className="form-select" value={f.directives.transfusion} onChange={(e) => setF({ ...f, directives: { ...f.directives, transfusion: e.target.value } })}>{TRANSFUSION.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          </div>
          <input aria-label="Other wishes" className="form-input mb-md" maxLength={300} placeholder="Other wishes (e.g. contact my brother before major procedures)" value={f.directives.otherWishes} onChange={(e) => setF({ ...f, directives: { ...f.directives, otherWishes: e.target.value } })} />

          <div className="row row--between mb-sm"><span className="text-sm">🏥 Preferred hospital</span><VisibilityPicker label="preferred hospital" value={vis.preferredHospital ?? 3} onChange={(t) => setVis({ ...vis, preferredHospital: t })} /></div>
          <div className="grid grid--2 mb-md">
            <input aria-label="Preferred hospital name" className="form-input" placeholder="Hospital name" value={f.prefHospital.name} onChange={(e) => setF({ ...f, prefHospital: { ...f.prefHospital, name: e.target.value } })} />
            <input aria-label="Preferred hospital phone" className="form-input" inputMode="tel" placeholder="Phone" value={f.prefHospital.phone} onChange={(e) => setF({ ...f, prefHospital: { ...f.prefHospital, phone: e.target.value } })} />
          </div>

          <div className="row row--between mb-sm"><span className="text-sm">👩‍⚕️ Treating specialists</span><VisibilityPicker label="specialists" value={vis.specialists ?? 3} onChange={(t) => setVis({ ...vis, specialists: t })} /></div>
          <RowsEditor id="spec" label="Specialist" rows={f.specialists} onChange={(specialists) => setF({ ...f, specialists })} addLabel="Add specialist" max={10}
            cols={[{ key: "name", label: "Name", placeholder: "Dr. Rao", grow: 2 }, { key: "specialty", label: "Specialty", placeholder: "Cardiologist" }, { key: "phone", label: "Phone", placeholder: "+91 …" }]} />

          <div className="row row--between mb-sm"><span className="text-sm">🛡️ Insurance / TPA</span><VisibilityPicker label="insurance details" value={vis.insuranceDetails ?? 3} onChange={(t) => setVis({ ...vis, insuranceDetails: t })} /></div>
          <div className="grid grid--3 mb-md">
            {([["provider", "Insurer"], ["policyNumber", "Policy number"], ["tpaHelpline", "TPA / claims helpline"]] as const).map(([k, l]) => (
              <input key={k} aria-label={l} className="form-input" placeholder={l} value={f.insuranceDetails[k]} onChange={(e) => setF({ ...f, insuranceDetails: { ...f.insuranceDetails, [k]: e.target.value } })} />))}
          </div>

          <div className="row row--between" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-md)" }}>
            <label className="check"><input type="checkbox" checked={f.confirmCurrent} onChange={(e) => setF({ ...f, confirmCurrent: e.target.checked })} /> I confirm these details are current</label>
            <span className="text-xs text-muted">{f.lastVerifiedAt ? `Last confirmed ${new Date(f.lastVerifiedAt).toLocaleDateString()}` : "Not confirmed yet"}</span>
          </div>
          <VisibilityPicker label="last verified" value={vis.lastVerifiedAt ?? 2} onChange={(t) => setVis({ ...vis, lastVerifiedAt: t })} />
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
