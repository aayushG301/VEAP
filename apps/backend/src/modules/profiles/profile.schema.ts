import { z } from "zod";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;
const short = z.string().trim().min(1).max(120);

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
});
export type Profile = z.infer<typeof profileSchema>;

export const FIELDS = ["fullName", "dateOfBirth", "bloodGroup", "allergies", "conditions", "medications", "implants", "organDonor", "emergencyContacts", "doctor", "emergencyInstructions", "insurance", "notes"] as const;
export type Field = (typeof FIELDS)[number];
export const DEFAULT_VISIBILITY: Record<Field, 1 | 2 | 3> = {
  fullName: 1, bloodGroup: 1, allergies: 1, emergencyContacts: 1, organDonor: 1, emergencyInstructions: 1,
  conditions: 2, medications: 2, implants: 2, doctor: 2,
  dateOfBirth: 3, insurance: 3, notes: 3,
};
export const visibilitySchema = z
  .record(z.string(), z.union([z.literal(1), z.literal(2), z.literal(3)]))
  .refine((v) => Object.keys(v).every((k) => (FIELDS as readonly string[]).includes(k)), "Unknown field in visibility map");
