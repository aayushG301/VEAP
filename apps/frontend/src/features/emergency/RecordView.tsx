import type React from "react";
import { ageFrom } from "../../lib/util";

const LABELS: Record<string, string> = { fullName: "Name", dateOfBirth: "Date of birth", bloodGroup: "Blood group", allergies: "Allergies", conditions: "Conditions", medications: "Medications", implants: "Implants / devices", organDonor: "Organ donor", emergencyContacts: "Emergency contacts", doctor: "Doctor / hospital", emergencyInstructions: "Emergency instructions", insurance: "Insurance", notes: "Medical history & notes",
  prescriptions: "Prescriptions", allergyDetails: "Allergy reactions", surgeries: "Surgical & hospital history", vaccinations: "Vaccinations", implantDetails: "Implant details & MRI safety",
  advanceDirectives: "Advance directives", preferredHospital: "Preferred hospital", specialists: "Treating specialists", insuranceDetails: "Insurance / TPA", lastVerifiedAt: "Record status" };
const ORDER = ["fullName", "dateOfBirth", "bloodGroup", "allergies", "allergyDetails", "conditions", "medications", "prescriptions", "implants", "implantDetails", "advanceDirectives", "emergencyInstructions", "organDonor",
  "emergencyContacts", "doctor", "preferredHospital", "specialists", "surgeries", "vaccinations", "insurance", "insuranceDetails", "notes", "lastVerifiedAt"];
const SEV: Record<string, string> = { mild: "badge--safe", moderate: "badge--warn", severe: "badge--danger", "life-threatening": "badge--danger" };
const MRI: Record<string, [string, string]> = { safe: ["MRI safe", "badge--safe"], conditional: ["MRI conditional", "badge--warn"], unsafe: ["MRI UNSAFE", "badge--danger"], unknown: ["MRI status unknown", "badge--info"] };
const Line = ({ children }: { children: React.ReactNode }) => <div style={{ marginBottom: 6 }}>{children}</div>;
const muted = (t: string) => t ? <span className="text-muted"> · {t}</span> : null;
export const tel = (p: string) => `tel:${p.replace(/[^+\d]/g, "")}`;

export function Contacts({ list }: { list: { name: string; phone: string; relationship?: string }[] }) {
  return <>{list.map((c) => (
    <div className="contact-card" key={c.phone + c.name}>
      <div><h4>{c.name}</h4><p>{[c.relationship, c.phone].filter(Boolean).join(" · ")}</p></div>
      <a className="contact-card__action" href={tel(c.phone)} aria-label={`Call ${c.name}`}>📞</a>
    </div>))}</>;
}

function Value({ k, v }: { k: string; v: any }) {
  if (k === "emergencyContacts") return <Contacts list={v} />;
  if (k === "prescriptions") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.drug}</b>{[r.dose, r.frequency].filter(Boolean).length > 0 && <> · {[r.dose, r.frequency].filter(Boolean).join(" · ")}</>}{muted(r.prescriber && `prescribed by ${r.prescriber}`)}</Line>)}</>;
  if (k === "allergyDetails") return <>{v.map((r: any, i: number) => <Line key={i}><span className="badge badge--allergy">{r.allergen}</span> <span className={`badge ${SEV[r.severity] || "badge--warn"}`}>{r.severity}</span>{muted(r.reaction)}</Line>)}</>;
  if (k === "surgeries") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.procedure}</b>{r.year && ` (${r.year})`}{muted(r.hospital)}</Line>)}</>;
  if (k === "vaccinations") return <>{v.map((r: any, i: number) => <Line key={i}>{r.name}{muted(r.date)}</Line>)}</>;
  if (k === "implantDetails") return <>{v.map((r: any, i: number) => { const m = MRI[r.mriSafety] || MRI.unknown; return <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.device}</b>{r.implantedYear && ` (${r.implantedYear})`} <span className={`badge ${m[1]}`}>{m[0]}</span></Line>; })}</>;
  if (k === "advanceDirectives") return <>
    {v.dnr && v.dnr !== "unknown" && <Line><span className={`badge ${v.dnr === "yes" ? "badge--danger" : "badge--safe"}`}>{v.dnr === "yes" ? "DNR: do not resuscitate" : "No DNR order"}</span></Line>}
    {v.transfusion && v.transfusion !== "unknown" && <Line>Blood transfusion: <b style={{ color: "var(--text-primary)" }}>{v.transfusion === "refuses" ? "REFUSES" : "accepts"}</b></Line>}
    {v.otherWishes && <Line>{v.otherWishes}</Line>}</>;
  if (k === "preferredHospital") return <>{v.name}{v.phone && <> · <a href={tel(v.phone)}>{v.phone}</a></>}</>;
  if (k === "specialists") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.name}</b>{muted(r.specialty)}{r.phone && <> · <a href={tel(r.phone)}>{r.phone}</a></>}</Line>)}</>;
  if (k === "insuranceDetails") return <>{[v.provider, v.policyNumber && `Policy ${v.policyNumber}`].filter(Boolean).join(" · ")}{v.tpaHelpline && <> · TPA helpline <a href={tel(v.tpaHelpline)}>{v.tpaHelpline}</a></>}</>;
  if (k === "lastVerifiedAt") { const d = new Date(v); return <>Confirmed current by the patient on {isNaN(+d) ? v : d.toLocaleDateString()}</>; }
  if (k === "allergies") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--allergy">{x}</span>) : "None recorded"}</div>;
  if (k === "conditions") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--condition">{x}</span>) : "None recorded"}</div>;
  if (Array.isArray(v)) return <>{v.length ? v.join(", ") : "None recorded"}</>;
  if (k === "doctor") return <>{[v.name, v.hospital].filter(Boolean).join(" · ") || "n/a"}{v.phone && <> · <a href={tel(v.phone)}>{v.phone}</a></>}</>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (k === "dateOfBirth") { const a = ageFrom(v); return <>{v}{a !== null && ` (age ${a})`}</>; }
  return <span className="pre">{String(v)}</span>;
}

/** Generic, ordered view of whatever fields the current access level allows. `skip` hides fields already shown above. */
export const isEmpty = (v: any) => v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && !Object.values(v).some((x) => x && x !== "unknown"));

export function RecordList({ data, skip = [] }: { data: Record<string, any>; skip?: string[] }) {
  // Hide fields that are empty (nothing recorded), so responders only see useful information.
  const keys = ORDER.filter((k) => !isEmpty(data[k]) && !skip.includes(k));
  if (!keys.length) return <div className="empty">No additional information is available at this level.</div>;
  return <dl className="data-list">{keys.map((k) => <div key={k}><dt>{LABELS[k] || k}</dt><dd><Value k={k} v={data[k]} /></dd></div>)}</dl>;
}
