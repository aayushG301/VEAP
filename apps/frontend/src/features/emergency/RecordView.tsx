import type React from "react";
import { ageFrom } from "../../lib/util";
import { useI18n } from "../../lib/i18n";

const LABELS: Record<string, string> = { fullName: "Name", dateOfBirth: "Date of birth", bloodGroup: "Blood group", allergies: "Allergies", conditions: "Conditions", medications: "Medications", implants: "Implants / devices", organDonor: "Organ donor", emergencyContacts: "Emergency contacts", doctor: "Doctor / hospital", emergencyInstructions: "Emergency instructions", insurance: "Insurance", notes: "Medical history & notes",
  prescriptions: "Prescriptions", allergyDetails: "Allergy reactions", surgeries: "Surgical & hospital history", vaccinations: "Vaccinations", implantDetails: "Implant details & MRI safety",
  advanceDirectives: "Advance directives", preferredHospital: "Preferred hospital", specialists: "Treating specialists", insuranceDetails: "Insurance / TPA", lastVerifiedAt: "Record status" };
const ORDER = ["fullName", "dateOfBirth", "bloodGroup", "sex", "height", "weight", "preferredLanguage", "communicationNeeds", "allergies", "allergyDetails", "conditions", "medications", "prescriptions", "implants", "implantDetails", "advanceDirectives", "emergencyInstructions", "organDonor", "organDonorId",
  "emergencyContacts", "doctor", "preferredHospital", "specialists", "surgeries", "vaccinations", "insurance", "insuranceDetails", "smoking", "alcohol", "pharmacy", "notes", "lastVerifiedAt"];
const SEV: Record<string, string> = { mild: "badge--safe", moderate: "badge--warn", severe: "badge--danger", "life-threatening": "badge--danger" };
const MRI: Record<string, [string, string]> = { safe: ["record.mri.safe", "badge--safe"], conditional: ["record.mri.conditional", "badge--warn"], unsafe: ["record.mri.unsafe", "badge--danger"], unknown: ["record.mri.unknown", "badge--info"] };
const LINE_KEYS: Record<string, Record<string, string>> = {
  sex: { unknown: "profile.sexUnknown", female: "profile.sexFemale", male: "profile.sexMale", other: "profile.sexOther" },
  smoking: { never: "profile.opt.never", former: "profile.opt.former", current: "profile.opt.current" },
  alcohol: { never: "profile.opt.never", occasional: "profile.opt.occasional", regular: "profile.opt.regular" },
};
const Line = ({ children }: { children: React.ReactNode }) => <div style={{ marginBottom: 6 }}>{children}</div>;
const muted = (t: string) => t ? <span className="text-muted"> · {t}</span> : null;
export const tel = (p: string) => `tel:${p.replace(/[^+\d]/g, "")}`;

export function Contacts({ list }: { list: { name: string; phone: string; relationship?: string }[] }) {
  const { t } = useI18n();
  return <>{list.map((c) => (
    <div className="contact-card" key={c.phone + c.name}>
      <div><h4>{c.name}</h4><p>{[c.relationship, c.phone].filter(Boolean).join(" · ")}</p></div>
      <a className="contact-card__action" href={tel(c.phone)} aria-label={`${t("record.call")} ${c.name}`}>📞</a>
    </div>))}</>;
}

function Value({ k, v }: { k: string; v: any }) {
  const { t } = useI18n();
  if (k === "emergencyContacts") return <Contacts list={v} />;
  if (k === "prescriptions") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.drug}</b>{[r.dose, r.frequency].filter(Boolean).length > 0 && <> · {[r.dose, r.frequency].filter(Boolean).join(" · ")}</>}{muted(r.prescriber && t("record.prescribedBy", { name: r.prescriber }))}</Line>)}</>;
  if (k === "allergyDetails") return <>{v.map((r: any, i: number) => <Line key={i}><span className="badge badge--allergy">{r.allergen}</span> <span className={`badge ${SEV[r.severity] || "badge--warn"}`}>{t(`profile.opt.${r.severity === "life-threatening" ? "lifeThreatening" : r.severity}`)}</span>{muted(r.reaction)}</Line>)}</>;
  if (k === "surgeries") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.procedure}</b>{r.year && ` (${r.year})`}{muted(r.hospital)}</Line>)}</>;
  if (k === "vaccinations") return <>{v.map((r: any, i: number) => <Line key={i}>{r.name}{muted(r.date)}</Line>)}</>;
  if (k === "implantDetails") return <>{v.map((r: any, i: number) => { const m = MRI[r.mriSafety] || MRI.unknown; return <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.device}</b>{r.implantedYear && ` (${r.implantedYear})`} <span className={`badge ${m[1]}`}>{t(m[0])}</span></Line>; })}</>;
  if (k === "advanceDirectives") return <>
    {v.dnr && v.dnr !== "unknown" && <Line><span className={`badge ${v.dnr === "yes" ? "badge--danger" : "badge--safe"}`}>{v.dnr === "yes" ? t("record.dnrYes") : t("record.dnrNo")}</span></Line>}
    {v.transfusion && v.transfusion !== "unknown" && <Line>{t("record.transfusion")} <b style={{ color: "var(--text-primary)" }}>{v.transfusion === "refuses" ? t("record.refuses") : t("record.accepts")}</b></Line>}
    {v.otherWishes && <Line>{v.otherWishes}</Line>}</>;
  if (k === "preferredHospital") return <>{v.name}{v.phone && <> · <a href={tel(v.phone)}>{v.phone}</a></>}</>;
  if (k === "specialists") return <>{v.map((r: any, i: number) => <Line key={i}><b style={{ color: "var(--text-primary)" }}>{r.name}</b>{muted(r.specialty)}{r.phone && <> · <a href={tel(r.phone)}>{r.phone}</a></>}</Line>)}</>;
  if (k === "insuranceDetails") return <>{[v.provider, v.policyNumber && t("record.policy", { num: v.policyNumber })].filter(Boolean).join(" · ")}{v.tpaHelpline && <> · {t("record.tpaHelpline")} <a href={tel(v.tpaHelpline)}>{v.tpaHelpline}</a></>}</>;
  if (k === "lastVerifiedAt") { const d = new Date(v); return <>{t("record.confirmedOn", { date: isNaN(+d) ? v : d.toLocaleDateString() })}</>; }
  if (k === "allergies") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--allergy">{x}</span>) : t("record.noneRecorded")}</div>;
  if (k === "conditions") return <div className="tags">{v.length ? v.map((x: string) => <span key={x} className="badge badge--condition">{x}</span>) : t("record.noneRecorded")}</div>;
  if (Array.isArray(v)) return <>{v.length ? v.join(", ") : t("record.noneRecorded")}</>;
  if (k === "doctor") return <>{[v.name, v.hospital].filter(Boolean).join(" · ") || t("record.na")}{v.phone && <> · <a href={tel(v.phone)}>{v.phone}</a></>}</>;
  if (typeof v === "boolean") return <>{v ? t("record.yes") : t("record.no")}</>;
  if (k === "dateOfBirth") { const a = ageFrom(v); return <>{v}{a !== null && ` (${t("emergency.yrs")} ${a})`}</>; }
  if (LINE_KEYS[k] && LINE_KEYS[k][String(v)]) return <>{t(LINE_KEYS[k][String(v)])}</>;
  return <span className="pre">{String(v)}</span>;
}

/** Generic, ordered view of whatever fields the current access level allows. `skip` hides fields already shown above. */
export const isEmpty = (v: any) => v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && !Object.values(v).some((x) => x && x !== "unknown"));

export function RecordList({ data, skip = [] }: { data: Record<string, any>; skip?: string[] }) {
  const { t } = useI18n();
  // Hide fields that are empty (nothing recorded), so responders only see useful information.
  // "unknown"/"never" are the untouched defaults, so they are treated as no information.
  const keys = ORDER.filter((k) => !isEmpty(data[k]) && data[k] !== "unknown" && data[k] !== "never" && !skip.includes(k));
  if (!keys.length) return <div className="empty">{t("record.empty")}</div>;
  return <dl className="data-list">{keys.map((k) => <div key={k}><dt>{t(`record.${k}`) || LABELS[k] || k}</dt><dd><Value k={k} v={data[k]} /></dd></div>)}</dl>;
}
