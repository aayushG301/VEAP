import { ageFrom } from "../../lib/util";

const LABELS: Record<string, string> = { fullName: "Name", dateOfBirth: "Date of birth", bloodGroup: "Blood group", allergies: "Allergies", conditions: "Conditions", medications: "Medications", implants: "Implants / devices", organDonor: "Organ donor", emergencyContacts: "Emergency contacts", doctor: "Doctor / hospital", emergencyInstructions: "Emergency instructions", insurance: "Insurance", notes: "Medical history & notes" };
const ORDER = ["fullName", "dateOfBirth", "bloodGroup", "allergies", "conditions", "medications", "implants", "emergencyInstructions", "organDonor", "emergencyContacts", "doctor", "insurance", "notes"];
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
  if (k === "allergies") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--allergy">{x}</span>) : "None recorded"}</div>;
  if (k === "conditions") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--condition">{x}</span>) : "None recorded"}</div>;
  if (Array.isArray(v)) return <>{v.length ? v.join(", ") : "None recorded"}</>;
  if (k === "doctor") return <>{[v.name, v.hospital].filter(Boolean).join(" · ") || "n/a"}{v.phone && <> · <a href={tel(v.phone)}>{v.phone}</a></>}</>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (k === "dateOfBirth") { const a = ageFrom(v); return <>{v}{a !== null && ` (age ${a})`}</>; }
  return <span className="pre">{String(v)}</span>;
}

/** Generic, ordered view of whatever fields the current access level allows. `skip` hides fields already shown above. */
export const isEmpty = (v: any) => v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && !Object.values(v).some(Boolean));

export function RecordList({ data, skip = [] }: { data: Record<string, any>; skip?: string[] }) {
  // Hide fields that are empty (nothing recorded), so responders only see useful information.
  const keys = ORDER.filter((k) => !isEmpty(data[k]) && !skip.includes(k));
  if (!keys.length) return <div className="empty">No additional information is available at this level.</div>;
  return <dl className="data-list">{keys.map((k) => <div key={k}><dt>{LABELS[k] || k}</dt><dd><Value k={k} v={data[k]} /></dd></div>)}</dl>;
}
