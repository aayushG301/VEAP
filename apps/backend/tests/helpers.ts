import request from "supertest";
import { createApp } from "../src/app";
import { col, connectDb } from "../src/config/db";

await connectDb();
export const app = createApp();
export const PW = "Str0ngPassw0rd!";
let n = 0;
export const uniqueEmail = (p = "u") => `${p}${Date.now()}${n++}@test.dev`;
export const api = (p: string) => `/api/v1${p}`;

export async function registerPatient(email = uniqueEmail("p")) {
  const agent = request.agent(app);
  const r = await agent.post(api("/auth/register")).send({ email, password: PW, name: "Test Patient" });
  if (r.status !== 201) throw new Error("register failed " + JSON.stringify(r.body));
  return { agent, email, token: r.body.accessToken as string, user: r.body.user, auth: { Authorization: `Bearer ${r.body.accessToken}` } };
}

export const FULL_PROFILE = {
  fullName: "Asha Verma", dateOfBirth: "1990-04-02", bloodGroup: "O-",
  allergies: ["Penicillin"], conditions: ["Type 2 diabetes", "Asthma"],
  medications: ["Warfarin 5mg", "Amoxicillin", "Ibuprofen"], implants: ["Pacemaker"], organDonor: true,
  emergencyContacts: [{ name: "Ravi Verma", phone: "+91 98765 43210", relationship: "Brother" }],
  doctor: { name: "Dr. Rao", phone: "+91 80000 11111", hospital: "City Hospital" },
  emergencyInstructions: "I carry an EpiPen in my left pocket.", insurance: "POLICY-12345", notes: "SECRET-NOTES-TIER3",
};

export async function patientWithQr() {
  const p = await registerPatient();
  const put = await request(app).put(api("/profile")).set(p.auth).send(FULL_PROFILE);
  if (put.status !== 200) throw new Error("profile failed " + JSON.stringify(put.body));
  const qr = await request(app).post(api("/qr")).set(p.auth);
  const url: string = qr.body.token.url;
  return { ...p, tokenId: qr.body.token.id as string, qrToken: url.split("/e/")[1] };
}

export async function tier2(qrToken: string, phone = "+91 90000 12345") {
  const o = await request(app).post(api("/access/otp/request")).send({ token: qrToken, phone });
  const v = await request(app).post(api("/access/otp/verify")).send({ token: qrToken, otpId: o.body.otpId, code: o.body.devOtp });
  return { otp: o.body, res: v, session: v.body.sessionToken as string };
}
export { request, col };
