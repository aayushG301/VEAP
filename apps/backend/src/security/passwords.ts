import argon2 from "argon2";
import { env } from "../config/env";

const opts = {
  type: argon2.argon2id as 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  secret: Buffer.from(env.passwordPepper),
};
export const hashPassword = (pw: string) => argon2.hash(pw, opts);
export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw, { secret: opts.secret });
  } catch {
    return false;
  }
}
// A fixed hash to burn comparable CPU time when the email does not exist (prevents user enumeration by timing).
export const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing");
