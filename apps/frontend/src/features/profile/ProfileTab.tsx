import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ageFrom } from "../../lib/util";
import { TagInput } from "../../components/TagInput";
import { VisibilityPicker } from "../../components/VisibilityPicker";
import { RowsEditor, type Row } from "../../components/RowsEditor";
import { useToast } from "../../components/Toast";
import { useI18n } from "../../lib/i18n";

const BLOOD = ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ALLERGY_HINTS = [
  "Penicillin",
  "Peanuts",
  "Latex",
  "Aspirin",
  "Sulfa drugs",
  "Shellfish",
  "Bee stings",
  "Ibuprofen",
];
const CONDITION_HINTS = [
  "Type 1 diabetes",
  "Type 2 diabetes",
  "Asthma",
  "Epilepsy",
  "Hypertension",
  "Heart disease",
  "Pregnancy",
];
const MED_HINTS = [
  "Insulin",
  "Metformin",
  "Warfarin",
  "Aspirin",
  "Salbutamol inhaler",
  "Atorvastatin",
];
const emptyContact = { name: "", phone: "", relationship: "" };

const SEVERITY = ["mild", "moderate", "severe", "life-threatening"];
const MRI = ["unknown", "safe", "conditional", "unsafe"];
const YNU = ["unknown", "no", "yes"];
const TRANSFUSION = ["unknown", "accepts", "refuses"];
const SEX = ["unknown", "female", "male", "other"];
const SMOKING = ["never", "former", "current"];
const ALCOHOL = ["never", "occasional", "regular"];
interface Extra {
  prescriptions: Row[];
  allergyDetails: Row[];
  surgeries: Row[];
  vaccinations: Row[];
  implantDetails: Row[];
  specialists: Row[];
  directives: { dnr: string; transfusion: string; otherWishes: string };
  prefHospital: { name: string; phone: string };
  insuranceDetails: {
    provider: string;
    policyNumber: string;
    tpaHelpline: string;
  };
  lastVerifiedAt: string;
  confirmCurrent: boolean;
}
const blankExtra: Extra = {
  prescriptions: [],
  allergyDetails: [],
  surgeries: [],
  vaccinations: [],
  implantDetails: [],
  specialists: [],
  directives: { dnr: "unknown", transfusion: "unknown", otherWishes: "" },
  prefHospital: { name: "", phone: "" },
  insuranceDetails: { provider: "", policyNumber: "", tpaHelpline: "" },
  lastVerifiedAt: "",
  confirmCurrent: false,
};
const extraFrom = (p: any): Extra => ({
  prescriptions: p.prescriptions || [],
  allergyDetails: p.allergyDetails || [],
  surgeries: p.surgeries || [],
  vaccinations: p.vaccinations || [],
  implantDetails: p.implantDetails || [],
  specialists: p.specialists || [],
  directives: { ...blankExtra.directives, ...(p.advanceDirectives || {}) },
  prefHospital: { ...blankExtra.prefHospital, ...(p.preferredHospital || {}) },
  insuranceDetails: {
    ...blankExtra.insuranceDetails,
    ...(p.insuranceDetails || {}),
  },
  lastVerifiedAt: p.lastVerifiedAt || "",
  confirmCurrent: false,
});
const cleanRows = (r: Row[], key: string) =>
  r
    .filter((x) => (x[key] || "").trim())
    .map((x) =>
      Object.fromEntries(
        Object.entries(x).map(([k, v]) => [k, (v || "").trim()]),
      ),
    );
interface Form extends Extra {
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  sex: string;
  preferredLanguage: string;
  organDonor: boolean;
  organDonorId: string;
  height: string;
  weight: string;
  communicationNeeds: string;
  smoking: string;
  alcohol: string;
  pharmacy: string;
  allergies: string[];
  conditions: string[];
  medications: string[];
  implants: string[];
  emergencyInstructions: string;
  contacts: { name: string; phone: string; relationship: string }[];
  doctor: { name: string; phone: string; hospital: string };
  insurance: string;
  notes: string;
}
const blank: Form = {
  fullName: "",
  dateOfBirth: "",
  bloodGroup: "Unknown",
  sex: "unknown",
  preferredLanguage: "",
  organDonor: false,
  organDonorId: "",
  height: "",
  weight: "",
  communicationNeeds: "",
  smoking: "never",
  alcohol: "never",
  pharmacy: "",
  allergies: [],
  conditions: [],
  medications: [],
  implants: [],
  emergencyInstructions: "",
  contacts: [{ ...emptyContact }],
  doctor: { name: "", phone: "", hospital: "" },
  insurance: "",
  notes: "",
  ...blankExtra,
};

function SectionHead({
  icon,
  title,
  field,
  vis,
  setVis,
}: {
  icon: string;
  title: string;
  field: string;
  vis: Record<string, number>;
  setVis: (v: Record<string, number>) => void;
}) {
  return (
    <div className="card__title">
      <span aria-hidden>{icon}</span>
      {title}
      <span className="spacer" />
      <VisibilityPicker
        label={title}
        value={vis[field] ?? 3}
        onChange={(t) => setVis({ ...vis, [field]: t })}
      />
    </div>
  );
}

export default function ProfileTab({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [f, setF] = useState<Form>(blank);
  const [vis, setVis] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState("");
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const hydrate = (r: any) => {
    const p = r.profile || {};
    const next: Form = {
      fullName: p.fullName || "",
      dateOfBirth: p.dateOfBirth || "",
      bloodGroup: p.bloodGroup || "Unknown",
      sex: p.sex || "unknown",
      preferredLanguage: p.preferredLanguage || "",
      organDonor: !!p.organDonor,
      organDonorId: p.organDonorId || "",
      height: p.height || "",
      weight: p.weight || "",
      communicationNeeds: p.communicationNeeds || "",
      smoking: p.smoking || "never",
      alcohol: p.alcohol || "never",
      pharmacy: p.pharmacy || "",
      allergies: p.allergies || [],
      conditions: p.conditions || [],
      medications: p.medications || [],
      implants: p.implants || [],
      emergencyInstructions: p.emergencyInstructions || "",
      contacts: p.emergencyContacts?.length
        ? p.emergencyContacts
        : [{ ...emptyContact }],
      doctor: p.doctor || { name: "", phone: "", hospital: "" },
      insurance: p.insurance || "",
      notes: p.notes || "",
      ...extraFrom(p),
    };
    setF(next);
    setVis(r.visibility || {});
    setScore(r.completeness || 0);
    setSnapshot(JSON.stringify({ f: next, v: r.visibility || {} }));
  };
  useEffect(() => {
    api("/profile")
      .then(hydrate)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);
  const dirty = !loading && JSON.stringify({ f, v: vis }) !== snapshot;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const body: any = {
        fullName: f.fullName,
        bloodGroup: f.bloodGroup,
        sex: f.sex,
        organDonor: f.organDonor,
        smoking: f.smoking,
        alcohol: f.alcohol,
        allergies: f.allergies,
        conditions: f.conditions,
        medications: f.medications,
        implants: f.implants,
        emergencyContacts: f.contacts.filter((c) => c.name || c.phone),
        doctor: f.doctor,
      };
      if (f.dateOfBirth) body.dateOfBirth = f.dateOfBirth;
      if (f.preferredLanguage.trim())
        body.preferredLanguage = f.preferredLanguage.trim();
      if (f.organDonorId.trim()) body.organDonorId = f.organDonorId.trim();
      if (f.height.trim()) body.height = f.height.trim();
      if (f.weight.trim()) body.weight = f.weight.trim();
      if (f.communicationNeeds.trim())
        body.communicationNeeds = f.communicationNeeds.trim();
      if (f.pharmacy.trim()) body.pharmacy = f.pharmacy.trim();
      if (f.insurance) body.insurance = f.insurance;
      if (f.notes) body.notes = f.notes;
      if (f.emergencyInstructions)
        body.emergencyInstructions = f.emergencyInstructions;
      body.prescriptions = cleanRows(f.prescriptions, "drug");
      body.allergyDetails = cleanRows(f.allergyDetails, "allergen");
      body.surgeries = cleanRows(f.surgeries, "procedure");
      body.vaccinations = cleanRows(f.vaccinations, "name");
      body.implantDetails = cleanRows(f.implantDetails, "device");
      body.specialists = cleanRows(f.specialists, "name");
      const d = f.directives;
      if (
        d.dnr !== "unknown" ||
        d.transfusion !== "unknown" ||
        d.otherWishes.trim()
      )
        body.advanceDirectives = {
          dnr: d.dnr,
          transfusion: d.transfusion,
          otherWishes: d.otherWishes.trim() || undefined,
        };
      if (f.prefHospital.name.trim() || f.prefHospital.phone.trim())
        body.preferredHospital = {
          name: f.prefHospital.name.trim(),
          phone: f.prefHospital.phone.trim(),
        };
      if (Object.values(f.insuranceDetails).some((v) => v.trim()))
        body.insuranceDetails = Object.fromEntries(
          Object.entries(f.insuranceDetails).map(([k, v]) => [k, v.trim()]),
        );
      if (f.confirmCurrent) body.confirmCurrent = true;
      await api("/profile", { method: "PUT", body });
      hydrate(
        await api("/profile/visibility", {
          method: "PUT",
          body: { visibility: vis },
        }),
      );
      toast(t("profile.savedToast"), "success");
      onSaved?.();
    } catch (e: any) {
      setErr(e.message);
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  const setContact = (i: number, k: string, v: string) =>
    setF({
      ...f,
      contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)),
    });

  const opt = {
    severity: {
      mild: t("profile.opt.mild"),
      moderate: t("profile.opt.moderate"),
      severe: t("profile.opt.severe"),
      "life-threatening": t("profile.opt.lifeThreatening"),
    } as Record<string, string>,
    mri: {
      unknown: t("profile.opt.unknown"),
      safe: t("profile.opt.mriSafe"),
      conditional: t("profile.opt.mriConditional"),
      unsafe: t("profile.opt.mriUnsafe"),
    } as Record<string, string>,
    ynu: {
      unknown: t("profile.opt.unknown"),
      no: t("profile.opt.no"),
      yes: t("profile.opt.yes"),
    } as Record<string, string>,
    transfusion: {
      unknown: t("profile.opt.unknown"),
      accepts: t("profile.opt.accepts"),
      refuses: t("profile.opt.refuses"),
    } as Record<string, string>,
    sex: {
      unknown: t("profile.sexUnknown"),
      female: t("profile.sexFemale"),
      male: t("profile.sexMale"),
      other: t("profile.sexOther"),
    } as Record<string, string>,
    smoking: {
      never: t("profile.opt.never"),
      former: t("profile.opt.former"),
      current: t("profile.opt.current"),
    } as Record<string, string>,
    alcohol: {
      never: t("profile.opt.never"),
      occasional: t("profile.opt.occasional"),
      regular: t("profile.opt.regular"),
    } as Record<string, string>,
  };

  // What a stranger scanning the QR would see right now (before saving), based on the visibility choices
  const preview = useMemo(() => {
    const show = (k: string) => (vis[k] ?? 3) <= 1;
    const rows: [string, string][] = [];
    if (show("fullName") && f.fullName)
      rows.push([t("profile.fullName"), f.fullName]);
    if (show("bloodGroup") && f.bloodGroup !== "Unknown")
      rows.push([t("profile.bloodGroup"), f.bloodGroup]);
    if (show("preferredLanguage") && f.preferredLanguage)
      rows.push([t("profile.preferredLanguage"), f.preferredLanguage]);
    if (show("communicationNeeds") && f.communicationNeeds)
      rows.push([t("profile.communicationNeeds"), f.communicationNeeds]);
    if (show("allergies") && f.allergies.length)
      rows.push([t("profile.allergies"), f.allergies.join(", ")]);
    if (show("conditions") && f.conditions.length)
      rows.push([t("profile.conditions"), f.conditions.join(", ")]);
    if (show("medications") && f.medications.length)
      rows.push([t("profile.medications"), f.medications.join(", ")]);
    if (show("emergencyInstructions") && f.emergencyInstructions)
      rows.push([
        t("profile.preview.instructions"),
        f.emergencyInstructions,
      ]);
    if (show("emergencyContacts") && f.contacts[0]?.name)
      rows.push([
        t("profile.preview.contact"),
        `${f.contacts[0].name} ${f.contacts[0].phone}`,
      ]);
    if (show("dateOfBirth") && ageFrom(f.dateOfBirth) !== null)
      rows.push([t("profile.preview.age"), String(ageFrom(f.dateOfBirth))]);
    return rows;
  }, [f, vis, t]);

  if (loading)
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 110 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );

  return (
    <form onSubmit={save} aria-label="profile form" className="split">
      <div>
        <div className="card card--info card--tight mb-md">
          <div className="text-sm" style={{ color: "var(--text-primary)" }}>
            <b>{t("profile.whoCanSee")}</b> {t("profile.whoCanSeeHint")}
          </div>
          <div className="row mt-sm text-xs">
            <span className="badge badge--safe">{t("profile.badgePublic")}</span>
            <span className="badge badge--warn">
              {t("profile.badgeVerified")}
            </span>
            <span className="badge badge--danger">
              {t("profile.badgeRestricted")}
            </span>
          </div>
        </div>

        <div className="card mb-md">
          <SectionHead
            icon="🧑"
            title={t("profile.personalInfo")}
            field="fullName"
            vis={vis}
            setVis={setVis}
          />
          <div className="form-group">
            <label className="form-label" htmlFor="fn">
              {t("profile.fullName")}
            </label>
            <input
              id="fn"
              className="form-input"
              required
              placeholder={t("profile.fullNamePlaceholder")}
              value={f.fullName}
              onChange={(e) => setF({ ...f, fullName: e.target.value })}
            />
          </div>
          <div className="grid grid--2">
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="dob">
                  {t("profile.dob")}
                </label>
                <VisibilityPicker
                  label={t("profile.dob")}
                  value={vis.dateOfBirth ?? 3}
                  onChange={(v) => setVis({ ...vis, dateOfBirth: v })}
                />
              </div>
              <input
                id="dob"
                className="form-input"
                type="date"
                value={f.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="bg">
                  {t("profile.bloodGroup")}
                </label>
                <VisibilityPicker
                  label={t("profile.bloodGroup")}
                  value={vis.bloodGroup ?? 3}
                  onChange={(v) => setVis({ ...vis, bloodGroup: v })}
                />
              </div>
              <select
                id="bg"
                className="form-select"
                value={f.bloodGroup}
                onChange={(e) => setF({ ...f, bloodGroup: e.target.value })}
              >
                {BLOOD.map((b) => (
                  <option key={b} value={b}>
                    {b === "Unknown" ? t("profile.selectBloodGroup") : b}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid--2">
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="sex">
                  {t("profile.sex")}
                </label>
                <VisibilityPicker
                  label={t("profile.sex")}
                  value={vis.sex ?? 2}
                  onChange={(v) => setVis({ ...vis, sex: v })}
                />
              </div>
              <select
                id="sex"
                className="form-select"
                value={f.sex}
                onChange={(e) => setF({ ...f, sex: e.target.value })}
              >
                {SEX.map((o) => (
                  <option key={o} value={o}>
                    {opt.sex[o]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="lang">
                  {t("profile.preferredLanguage")}
                </label>
                <VisibilityPicker
                  label={t("profile.preferredLanguage")}
                  value={vis.preferredLanguage ?? 1}
                  onChange={(v) => setVis({ ...vis, preferredLanguage: v })}
                />
              </div>
              <input
                id="lang"
                className="form-input"
                maxLength={60}
                placeholder={t("profile.preferredLanguagePlaceholder")}
                value={f.preferredLanguage}
                onChange={(e) =>
                  setF({ ...f, preferredLanguage: e.target.value })
                }
              />
            </div>
          </div>
          <div className="row row--between">
            <label className="check">
              <input
                type="checkbox"
                checked={f.organDonor}
                onChange={(e) => setF({ ...f, organDonor: e.target.checked })}
              />{" "}
              {t("profile.organDonor")}
            </label>
            <VisibilityPicker
              label={t("profile.organDonor")}
              value={vis.organDonor ?? 3}
              onChange={(v) => setVis({ ...vis, organDonor: v })}
            />
          </div>
          {f.organDonor && (
            <div className="form-group mt-sm">
              <div className="row row--between">
                <label className="form-label" htmlFor="did">
                  {t("profile.organDonorId")}
                </label>
                <VisibilityPicker
                  label={t("profile.organDonorId")}
                  value={vis.organDonorId ?? 3}
                  onChange={(v) => setVis({ ...vis, organDonorId: v })}
                />
              </div>
              <input
                id="did"
                className="form-input"
                maxLength={40}
                placeholder={t("profile.organDonorIdPlaceholder")}
                value={f.organDonorId}
                onChange={(e) => setF({ ...f, organDonorId: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="card mb-md">
          <div className="card__title">
            <span aria-hidden>📏</span>
            {t("profile.bodyTitle")}
          </div>
          <div className="grid grid--2">
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="ht">
                  {t("profile.height")}
                </label>
                <VisibilityPicker
                  label={t("profile.height")}
                  value={vis.height ?? 3}
                  onChange={(v) => setVis({ ...vis, height: v })}
                />
              </div>
              <input
                id="ht"
                className="form-input"
                inputMode="numeric"
                maxLength={10}
                placeholder={t("profile.heightPlaceholder")}
                value={f.height}
                onChange={(e) => setF({ ...f, height: e.target.value })}
              />
            </div>
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="wt">
                  {t("profile.weight")}
                </label>
                <VisibilityPicker
                  label={t("profile.weight")}
                  value={vis.weight ?? 3}
                  onChange={(v) => setVis({ ...vis, weight: v })}
                />
              </div>
              <input
                id="wt"
                className="form-input"
                inputMode="numeric"
                maxLength={10}
                placeholder={t("profile.weightPlaceholder")}
                value={f.weight}
                onChange={(e) => setF({ ...f, weight: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <div className="row row--between">
              <label className="form-label" htmlFor="comm">
                {t("profile.communicationNeeds")}
              </label>
              <VisibilityPicker
                label={t("profile.communicationNeeds")}
                value={vis.communicationNeeds ?? 1}
                onChange={(v) => setVis({ ...vis, communicationNeeds: v })}
              />
            </div>
            <input
              id="comm"
              className="form-input"
              maxLength={200}
              placeholder={t("profile.communicationNeedsPlaceholder")}
              value={f.communicationNeeds}
              onChange={(e) =>
                setF({ ...f, communicationNeeds: e.target.value })
              }
            />
          </div>
        </div>

        <div className="card mb-md">
          <div className="card__title">
            <span aria-hidden>🩺</span>
            {t("profile.medicalInfo")}
          </div>
          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.allergies")}</span>
            <VisibilityPicker
              label={t("profile.allergies")}
              value={vis.allergies ?? 3}
              onChange={(v) => setVis({ ...vis, allergies: v })}
            />
          </div>
          <TagInput
            label={t("profile.allergies")}
            id="allergies"
            value={f.allergies}
            onChange={(v) => setF({ ...f, allergies: v })}
            variant="red"
            placeholder={t("profile.allergiesPlaceholder")}
            suggestions={ALLERGY_HINTS}
          />
          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.conditions")}</span>
            <VisibilityPicker
              label={t("profile.conditions")}
              value={vis.conditions ?? 3}
              onChange={(v) => setVis({ ...vis, conditions: v })}
            />
          </div>
          <TagInput
            label={t("profile.conditions")}
            id="conditions"
            value={f.conditions}
            onChange={(v) => setF({ ...f, conditions: v })}
            placeholder={t("profile.conditionsPlaceholder")}
            suggestions={CONDITION_HINTS}
          />
          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.medications")}</span>
            <VisibilityPicker
              label={t("profile.medications")}
              value={vis.medications ?? 3}
              onChange={(v) => setVis({ ...vis, medications: v })}
            />
          </div>
          <TagInput
            label={t("profile.medications")}
            id="medications"
            value={f.medications}
            onChange={(v) => setF({ ...f, medications: v })}
            variant="blue"
            placeholder={t("profile.medicationsPlaceholder")}
            suggestions={MED_HINTS}
            max={40}
          />
          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.implants")}</span>
            <VisibilityPicker
              label={t("profile.implants")}
              value={vis.implants ?? 3}
              onChange={(v) => setVis({ ...vis, implants: v })}
            />
          </div>
          <TagInput
            label={t("profile.implants")}
            id="implants"
            value={f.implants}
            onChange={(v) => setF({ ...f, implants: v })}
            variant="purple"
            placeholder={t("profile.implantsPlaceholder")}
            max={15}
          />
        </div>

        <div className="card card--danger mb-md">
          <SectionHead
            icon="⚠️"
            title={t("profile.emergencyInstructions")}
            field="emergencyInstructions"
            vis={vis}
            setVis={setVis}
          />
          <textarea
            id="emergencyInstructions"
            aria-label={t("profile.emergencyInstructions")}
            className="form-textarea"
            maxLength={500}
            placeholder={t("profile.emergencyInstructionsPlaceholder")}
            value={f.emergencyInstructions}
            onChange={(e) =>
              setF({ ...f, emergencyInstructions: e.target.value })
            }
          />
          <div className="form-hint">
            {t("profile.instructionsHint")} {f.emergencyInstructions.length}
            /500
          </div>
        </div>

        <div className="card mb-md">
          <SectionHead
            icon="📞"
            title={t("profile.emergencyContacts")}
            field="emergencyContacts"
            vis={vis}
            setVis={setVis}
          />
          <p className="text-xs text-muted mb-sm">{t("profile.contactsDesc")}</p>
          {f.contacts.map((c, i) => (
            <div
              key={i}
              className="grid grid--3 mb-sm"
              style={{ alignItems: "end" }}
            >
              <div>
                <label className="form-label" htmlFor={`cn${i}`}>
                  {i === 0 ? t("profile.primaryContact") : t("profile.name")}
                </label>
                <input
                  id={`cn${i}`}
                  className="form-input"
                  placeholder={t("profile.name")}
                  value={c.name}
                  onChange={(e) => setContact(i, "name", e.target.value)}
                />
              </div>
              <div>
                <label className="form-label" htmlFor={`cp${i}`}>
                  {t("profile.phone")}
                </label>
                <input
                  id={`cp${i}`}
                  className="form-input"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  value={c.phone}
                  onChange={(e) => setContact(i, "phone", e.target.value)}
                />
              </div>
              <div
                className="row"
                style={{ flexWrap: "nowrap", alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <label className="form-label" htmlFor={`cr${i}`}>
                    {t("profile.relationship")}
                  </label>
                  <input
                    id={`cr${i}`}
                    className="form-input"
                    placeholder={t("profile.relationshipPlaceholder")}
                    value={c.relationship}
                    onChange={(e) =>
                      setContact(i, "relationship", e.target.value)
                    }
                  />
                </div>
                {f.contacts.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label={`${t("common.remove")} ${i + 1}`}
                    style={{ minHeight: 46 }}
                    onClick={() =>
                      setF({
                        ...f,
                        contacts: f.contacts.filter((_, j) => j !== i),
                      })
                    }
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
          {f.contacts.length < 5 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--full mt-sm"
              onClick={() =>
                setF({ ...f, contacts: [...f.contacts, { ...emptyContact }] })
              }
            >
              {t("profile.addContact")}
            </button>
          )}
        </div>

        <div className="card mb-md">
          <SectionHead
            icon="🏥"
            title={t("profile.doctorHospital")}
            field="doctor"
            vis={vis}
            setVis={setVis}
          />
          <div className="grid grid--3">
            {(
              [
                ["name", t("profile.doctorName")],
                ["phone", t("profile.doctorPhone")],
                ["hospital", t("profile.doctorHospitalName")],
              ] as const
            ).map(([k, label]) => (
              <div className="form-group" key={k}>
                <label className="form-label" htmlFor={`d${k}`}>
                  {label}
                </label>
                <input
                  id={`d${k}`}
                  className="form-input"
                  value={f.doctor[k] || ""}
                  onChange={(e) =>
                    setF({ ...f, doctor: { ...f.doctor, [k]: e.target.value } })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="card mb-md">
          <div className="card__title">
            <span aria-hidden>🧾</span>
            {t("profile.detailedRecord")}
          </div>
          <p className="text-xs text-muted mb-md">
            {t("profile.detailedRecordDesc")}
          </p>

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.prescriptionsBlock")}</span>
            <VisibilityPicker
              label={t("profile.prescriptionsBlock")}
              value={vis.prescriptions ?? 2}
              onChange={(v) => setVis({ ...vis, prescriptions: v })}
            />
          </div>
          <RowsEditor
            id="rx"
            label={t("profile.rows.prescription")}
            rows={f.prescriptions}
            onChange={(prescriptions) => setF({ ...f, prescriptions })}
            addLabel={t("profile.rows.addPrescription")}
            max={20}
            cols={[
              {
                key: "drug",
                label: t("profile.col.medicine"),
                placeholder: "Warfarin",
                grow: 2,
              },
              { key: "dose", label: t("profile.col.dose"), placeholder: "5 mg" },
              {
                key: "frequency",
                label: t("profile.col.frequency"),
                placeholder: "Once daily",
              },
              {
                key: "prescriber",
                label: t("profile.col.prescriber"),
                placeholder: "Dr. Rao",
                grow: 2,
              },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.allergyReactionsBlock")}</span>
            <VisibilityPicker
              label={t("profile.allergyReactionsBlock")}
              value={vis.allergyDetails ?? 2}
              onChange={(v) => setVis({ ...vis, allergyDetails: v })}
            />
          </div>
          <RowsEditor
            id="alg"
            label={t("profile.rows.allergy")}
            rows={f.allergyDetails}
            onChange={(allergyDetails) => setF({ ...f, allergyDetails })}
            addLabel={t("profile.rows.addAllergy")}
            max={20}
            cols={[
              {
                key: "allergen",
                label: t("profile.col.allergen"),
                placeholder: "Penicillin",
                grow: 2,
              },
              {
                key: "reaction",
                label: t("profile.col.reaction"),
                placeholder: "Hives, swelling",
                grow: 2,
              },
              {
                key: "severity",
                label: t("profile.col.severity"),
                options: SEVERITY,
                optionLabels: opt.severity,
              },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.surgeriesBlock")}</span>
            <VisibilityPicker
              label={t("profile.surgeriesBlock")}
              value={vis.surgeries ?? 3}
              onChange={(v) => setVis({ ...vis, surgeries: v })}
            />
          </div>
          <RowsEditor
            id="surg"
            label={t("profile.rows.surgery")}
            rows={f.surgeries}
            onChange={(surgeries) => setF({ ...f, surgeries })}
            addLabel={t("profile.rows.addSurgery")}
            max={20}
            cols={[
              {
                key: "procedure",
                label: t("profile.col.procedure"),
                placeholder: "Appendectomy",
                grow: 2,
              },
              { key: "year", label: t("profile.col.year"), placeholder: "2019" },
              {
                key: "hospital",
                label: t("profile.col.hospital"),
                placeholder: "City Hospital",
                grow: 2,
              },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.vaccinationsBlock")}</span>
            <VisibilityPicker
              label={t("profile.vaccinationsBlock")}
              value={vis.vaccinations ?? 3}
              onChange={(v) => setVis({ ...vis, vaccinations: v })}
            />
          </div>
          <RowsEditor
            id="vax"
            label={t("profile.rows.vaccination")}
            rows={f.vaccinations}
            onChange={(vaccinations) => setF({ ...f, vaccinations })}
            addLabel={t("profile.rows.addVaccination")}
            max={20}
            cols={[
              {
                key: "name",
                label: t("profile.col.vaccine"),
                placeholder: "Tetanus booster",
                grow: 2,
              },
              {
                key: "date",
                label: t("profile.col.date"),
                placeholder: "2024-02-10",
              },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.implantBlock")}</span>
            <VisibilityPicker
              label={t("profile.implantBlock")}
              value={vis.implantDetails ?? 3}
              onChange={(v) => setVis({ ...vis, implantDetails: v })}
            />
          </div>
          <RowsEditor
            id="imp"
            label={t("profile.rows.implant")}
            rows={f.implantDetails}
            onChange={(implantDetails) => setF({ ...f, implantDetails })}
            addLabel={t("profile.rows.addImplant")}
            max={15}
            cols={[
              {
                key: "device",
                label: t("profile.col.device"),
                placeholder: "Pacemaker (model)",
                grow: 2,
              },
              {
                key: "implantedYear",
                label: t("profile.col.year"),
                placeholder: "2021",
              },
              {
                key: "mriSafety",
                label: t("profile.col.mri"),
                options: MRI,
                optionLabels: opt.mri,
              },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">
              {t("profile.advanceDirectivesBlock")}
            </span>
            <VisibilityPicker
              label={t("profile.advanceDirectivesBlock")}
              value={vis.advanceDirectives ?? 3}
              onChange={(v) => setVis({ ...vis, advanceDirectives: v })}
            />
          </div>
          <div className="grid grid--2 mb-sm">
            <div className="form-group">
              <label className="form-label" htmlFor="dnr">
                {t("profile.dnr")}
              </label>
              <select
                id="dnr"
                className="form-select"
                value={f.directives.dnr}
                onChange={(e) =>
                  setF({
                    ...f,
                    directives: { ...f.directives, dnr: e.target.value },
                  })
                }
              >
                {YNU.map((o) => (
                  <option key={o} value={o}>
                    {opt.ynu[o]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="trf">
                {t("profile.transfusion")}
              </label>
              <select
                id="trf"
                className="form-select"
                value={f.directives.transfusion}
                onChange={(e) =>
                  setF({
                    ...f,
                    directives: {
                      ...f.directives,
                      transfusion: e.target.value,
                    },
                  })
                }
              >
                {TRANSFUSION.map((o) => (
                  <option key={o} value={o}>
                    {opt.transfusion[o]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <input
            aria-label={t("profile.otherWishesPlaceholder")}
            className="form-input mb-md"
            maxLength={300}
            placeholder={t("profile.otherWishesPlaceholder")}
            value={f.directives.otherWishes}
            onChange={(e) =>
              setF({
                ...f,
                directives: { ...f.directives, otherWishes: e.target.value },
              })
            }
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.preferredHospitalBlock")}</span>
            <VisibilityPicker
              label={t("profile.preferredHospitalBlock")}
              value={vis.preferredHospital ?? 3}
              onChange={(v) => setVis({ ...vis, preferredHospital: v })}
            />
          </div>
          <div className="grid grid--2 mb-md">
            <input
              aria-label={t("profile.hospitalName")}
              className="form-input"
              placeholder={t("profile.hospitalName")}
              value={f.prefHospital.name}
              onChange={(e) =>
                setF({
                  ...f,
                  prefHospital: { ...f.prefHospital, name: e.target.value },
                })
              }
            />
            <input
              aria-label={t("profile.phone")}
              className="form-input"
              inputMode="tel"
              placeholder={t("profile.phone")}
              value={f.prefHospital.phone}
              onChange={(e) =>
                setF({
                  ...f,
                  prefHospital: { ...f.prefHospital, phone: e.target.value },
                })
              }
            />
          </div>

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.specialistsBlock")}</span>
            <VisibilityPicker
              label={t("profile.specialistsBlock")}
              value={vis.specialists ?? 3}
              onChange={(v) => setVis({ ...vis, specialists: v })}
            />
          </div>
          <RowsEditor
            id="spec"
            label={t("profile.rows.specialist")}
            rows={f.specialists}
            onChange={(specialists) => setF({ ...f, specialists })}
            addLabel={t("profile.rows.addSpecialist")}
            max={10}
            cols={[
              {
                key: "name",
                label: t("profile.name"),
                placeholder: "Dr. Rao",
                grow: 2,
              },
              {
                key: "specialty",
                label: t("profile.col.specialty"),
                placeholder: "Cardiologist",
              },
              { key: "phone", label: t("profile.phone"), placeholder: "+91 …" },
            ]}
          />

          <div className="row row--between mb-sm">
            <span className="text-sm">{t("profile.insuranceTpaBlock")}</span>
            <VisibilityPicker
              label={t("profile.insuranceTpaBlock")}
              value={vis.insuranceDetails ?? 3}
              onChange={(v) => setVis({ ...vis, insuranceDetails: v })}
            />
          </div>
          <div className="grid grid--3 mb-md">
            {(
              [
                ["provider", t("profile.insurer")],
                ["policyNumber", t("profile.policyNumber")],
                ["tpaHelpline", t("profile.tpaHelpline")],
              ] as const
            ).map(([k, l]) => (
              <input
                key={k}
                aria-label={l}
                className="form-input"
                placeholder={l}
                value={f.insuranceDetails[k]}
                onChange={(e) =>
                  setF({
                    ...f,
                    insuranceDetails: {
                      ...f.insuranceDetails,
                      [k]: e.target.value,
                    },
                  })
                }
              />
            ))}
          </div>

          <div
            className="row row--between"
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "var(--space-md)",
            }}
          >
            <label className="check">
              <input
                type="checkbox"
                checked={f.confirmCurrent}
                onChange={(e) =>
                  setF({ ...f, confirmCurrent: e.target.checked })
                }
              />{" "}
              {t("profile.confirmCurrent")}
            </label>
            <span className="text-xs text-muted">
              {f.lastVerifiedAt
                ? t("profile.lastConfirmed", {
                    date: new Date(f.lastVerifiedAt).toLocaleDateString(),
                  })
                : t("profile.notConfirmed")}
            </span>
          </div>
          <VisibilityPicker
            label={t("profile.lastConfirmed", { date: "" })}
            value={vis.lastVerifiedAt ?? 2}
            onChange={(v) => setVis({ ...vis, lastVerifiedAt: v })}
          />
        </div>

        <div className="card mb-md">
          <div className="card__title">
            <span aria-hidden>🚬</span>
            {t("profile.lifestyleBlock")}
          </div>
          <div className="grid grid--2">
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="smk">
                  {t("profile.smoking")}
                </label>
                <VisibilityPicker
                  label={t("profile.smoking")}
                  value={vis.smoking ?? 2}
                  onChange={(v) => setVis({ ...vis, smoking: v })}
                />
              </div>
              <select
                id="smk"
                className="form-select"
                value={f.smoking}
                onChange={(e) => setF({ ...f, smoking: e.target.value })}
              >
                {SMOKING.map((o) => (
                  <option key={o} value={o}>
                    {opt.smoking[o]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <div className="row row--between">
                <label className="form-label" htmlFor="alc">
                  {t("profile.alcohol")}
                </label>
                <VisibilityPicker
                  label={t("profile.alcohol")}
                  value={vis.alcohol ?? 2}
                  onChange={(v) => setVis({ ...vis, alcohol: v })}
                />
              </div>
              <select
                id="alc"
                className="form-select"
                value={f.alcohol}
                onChange={(e) => setF({ ...f, alcohol: e.target.value })}
              >
                {ALCOHOL.map((o) => (
                  <option key={o} value={o}>
                    {opt.alcohol[o]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <div className="row row--between">
              <label className="form-label" htmlFor="pharm">
                {t("profile.pharmacy")}
              </label>
              <VisibilityPicker
                label={t("profile.pharmacy")}
                value={vis.pharmacy ?? 3}
                onChange={(v) => setVis({ ...vis, pharmacy: v })}
              />
            </div>
            <input
              id="pharm"
              className="form-input"
              maxLength={120}
              placeholder={t("profile.pharmacyPlaceholder")}
              value={f.pharmacy}
              onChange={(e) => setF({ ...f, pharmacy: e.target.value })}
            />
          </div>
        </div>

        <div className="card mb-md">
          <div className="card__title">
            <span aria-hidden>📋</span>
            {t("profile.insuranceHistory")}
          </div>
          <div className="row row--between">
            <label className="form-label" htmlFor="ins">
              {t("profile.insurance")}
            </label>
            <VisibilityPicker
              label={t("profile.insurance")}
              value={vis.insurance ?? 3}
              onChange={(v) => setVis({ ...vis, insurance: v })}
            />
          </div>
          <input
            id="ins"
            className="form-input mb-md"
            placeholder={t("profile.insurancePlaceholder")}
            value={f.insurance}
            onChange={(e) => setF({ ...f, insurance: e.target.value })}
          />
          <div className="row row--between mt-md">
            <label className="form-label" htmlFor="notes">
              {t("profile.medicalHistory")}
            </label>
            <VisibilityPicker
              label={t("profile.medicalHistory")}
              value={vis.notes ?? 3}
              onChange={(v) => setVis({ ...vis, notes: v })}
            />
          </div>
          <textarea
            id="notes"
            className="form-textarea"
            maxLength={2000}
            placeholder={t("profile.notesPlaceholder")}
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </div>

        {err && (
          <div className="form-error" role="alert">
            {err}
          </div>
        )}
        <div className="savebar" aria-live="polite">
          <span
            className="text-sm"
            style={{
              color: dirty ? "var(--warning-amber)" : "var(--text-muted)",
            }}
          >
            {dirty ? t("profile.unsaved") : t("profile.allSaved")}
          </span>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={saving || !dirty}>
            {saving ? <span className="spinner" /> : t("profile.save")}
          </button>
        </div>
      </div>

      <aside
        className="stack"
        style={{ position: "sticky", top: "calc(var(--nav-h) + 12px)" }}
      >
        <div className="card">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <div className="ring" style={{ ["--p" as any]: score }}>
              <span>{score}%</span>
            </div>
            <div>
              <b>{t("profile.completeness")}</b>
              <p className="text-sm">
                {score >= 85
                  ? t("profile.completenessGood")
                  : t("profile.completenessTodo")}
              </p>
            </div>
          </div>
        </div>
        <div className="card card--success">
          <div className="card__title">{t("profile.strangerSees")}</div>
          <p className="text-xs text-muted mb-sm">
            {t("profile.strangerSeesDesc")}
          </p>
          {preview.length === 0 ? (
            <div className="empty">{t("profile.nothingPublic")}</div>
          ) : (
            <dl className="data-list">
              {preview.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </aside>
    </form>
  );
}
