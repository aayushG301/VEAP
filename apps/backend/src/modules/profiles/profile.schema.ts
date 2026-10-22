import { z } from "zod";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;
const short = z.string().trim().min(1).max(120);
const text = (n: number) => z.string().trim().max(n).default("");
export const SEVERITY = ["mild", "moderate", "severe", "life-threatening"] as const;
export const MRI = ["safe", "conditional", "unsafe", "unknown"] as const;
const YNU = ["yes", "no", "unknown"] as const;
const TRANSFUSION = ["accepts", "refuses", "unknown"] as const;

export const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  dateOfBirth: z.string().trim().max(20).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).default("Unknown"),
  allergies: z.array(short).max(30).default([]),
  conditions: z.array(short).max(30).default([]),
  medications: z.array(short).max(40).default([]),
  implants: z.array(short).max(15).default([]),
  organDonor: z.boolean().default(false),
  emergencyContacts: z.array(z.object({
    name: short,
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, "Invalid phone number"),
    relationship: z.string().trim().max(40).default(""),
  })).max(5).default([]),
  doctor: z.object({ name: z.string().trim().max(120).default(""), phone: z.string().trim().max(25).default(""), hospital: z.string().trim().max(120).default("") }).optional(),
  emergencyInstructions: z.string().trim().max(500).optional(),
  insurance: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),

  // ---- Detailed clinical record (mostly Level 2/3) ----
  prescriptions: z.array(z.object({ drug: short, dose: text(60), frequency: text(60), prescriber: text(80) })).max(20).default([]),
  allergyDetails: z.array(z.object({ allergen: short, reaction: text(120), severity: z.enum(SEVERITY).default("moderate") })).max(20).default([]),
  surgeries: z.array(z.object({ procedure: short, year: text(10), hospital: text(120) })).max(20).default([]),
  vaccinations: z.array(z.object({ name: short, date: text(20) })).max(20).default([]),
  implantDetails: z.array(z.object({ device: short, implantedYear: text(10), mriSafety: z.enum(MRI).default("unknown") })).max(15).default([]),
  advanceDirectives: z.object({ dnr: z.enum(YNU).default("unknown"), transfusion: z.enum(TRANSFUSION).default("unknown"), otherWishes: z.string().trim().max(300).optional() }).optional(),
  preferredHospital: z.object({ name: text(120), phone: text(25) }).optional(),
  specialists: z.array(z.object({ name: short, specialty: text(60), phone: text(25) })).max(10).default([]),
  insuranceDetails: z.object({ provider: text(80), policyNumber: text(60), tpaHelpline: text(30) }).optional(),
  lastVerifiedAt: z.string().trim().max(40).optional(),
  /** Request flag only (never stored): stamps lastVerifiedAt with the server clock. */
  confirmCurrent: z.boolean().optional(),
});
export type Profile = z.infer<typeof profileSchema>;

export const FIELDS = ["fullName", "dateOfBirth", "bloodGroup", "allergies", "conditions", "medications", "implants", "organDonor", "emergencyContacts", "doctor", "emergencyInstructions", "insurance", "notes",
  "prescriptions", "allergyDetails", "surgeries", "vaccinations", "implantDetails", "advanceDirectives", "preferredHospital", "specialists", "insuranceDetails", "lastVerifiedAt"] as const;
export type Field = (typeof FIELDS)[number];
export const DEFAULT_VISIBILITY: Record<Field, 1 | 2 | 3> = {
  fullName: 1, bloodGroup: 1, allergies: 1, emergencyContacts: 1, organDonor: 1, emergencyInstructions: 1,
  conditions: 2, medications: 2, implants: 2, doctor: 2,
  dateOfBirth: 3, insurance: 3, notes: 3,
  prescriptions: 2, allergyDetails: 2, lastVerifiedAt: 2,
  surgeries: 3, vaccinations: 3, implantDetails: 3, advanceDirectives: 3, preferredHospital: 3, specialists: 3, insuranceDetails: 3,
};
export const visibilitySchema = z
  .record(z.string(), z.union([z.literal(1), z.literal(2), z.literal(3)]))
  .refine((v) => Object.keys(v).every((k) => (FIELDS as readonly string[]).includes(k)), "Unknown field in visibility map");
