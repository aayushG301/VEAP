# Security model

## Controls implemented (and tested)
| Threat | Control |
|---|---|
| Stolen / lost QR | One-tap revoke (also kills live sessions); regenerate; Tier 1 exposes only what the owner allows |
| QR enumeration / scraping | 128-bit random ids, HMAC signature checked before any DB lookup, per-IP scan rate limit, ML anomaly score, auto-lock, honeytoken + invalid-signature logging |
| Fake responder | Tier 2 code is texted to the **patient's own emergency contact**, so a stranger cannot self-verify with their own phone (fallback to the responder's phone only when the patient has no contact, and that is flagged in the audit log); codes are hashed, expiring, 3 attempts; admin-approved license for credentialed Tier 3 |
| Break-glass abuse | Requires verified Tier 2 session, written reason, instant critical alert, permanent audit entry |
| DB leak | Field-level AES-256-GCM (AAD = user:field), wrapped per-user keys, hashed OTPs/refresh tokens/QR tokens, Argon2id passwords with pepper, encrypted TOTP secrets |
| Token theft | 15-min access JWT, rotating refresh token with reuse detection, immediate server-side session revocation |
| Brute force | Per-IP limiters, account lockout, OTP attempt caps, uniform errors |
| Injection / XSS | Zod validation on every input (strings/primitives only, so `$`-operator objects cannot reach MongoDB queries), React escaping, strict CSP on API (`default-src 'none'`) and nginx |
| CSRF | Refresh/logout need `X-Requested-With: veap` + SameSite=Strict cookie; API uses bearer tokens |
| Log tampering | Per-owner hash chain; edits and mid-chain deletions are detected by `/audit/verify` |
| Prompt injection (assistant) | Retrieval-only (no free-text generation), input sanitising/flagging, fixed disclaimer |

## Known gaps (be honest with reviewers)
* Deleting the **last** audit rows is not detectable without anchoring the head hash externally.
* Master key lives in an env var; production should use a KMS and key rotation.
* In `OTP_MODE=mock` the code is returned to the browser for demos (disabled when `NODE_ENV=production`). Twilio delivery is implemented but only tested against a mocked Twilio API.
* Rate limiting is per-process memory; add Redis for horizontal scale.
* MongoDB must never be exposed publicly: enable authentication and TLS (Atlas does both) and restrict network access. Encryption at rest of the database volume is not configured by this project.
* Tier 1 data (name, blood group, allergies, contacts) is public to anyone with the QR by design; owners choose what goes there.
* The triage model is trained on synthetic data and is not clinically validated.
* No independent audit or penetration test has been performed; not HIPAA/GDPR certified.


## Level 3 override and contact alerts (v2.1)
* **Break-glass is no longer "type a reason".** The responder must hold a Level 2 session, then authenticate as hospital staff: hospital ID + council/staff ID + 6-digit PIN checked against the registry (argon2id hashes, hospital and staff must both be active, ID must belong to that hospital).
* **No enumeration:** unknown ID, wrong hospital, wrong PIN, revoked staff and suspended hospital return the same message; unknown IDs burn the same CPU time as wrong PINs.
* **Brute force:** 5 wrong PINs lock the staff ID for 15 min; per-IP OTP/override rate limit; max 3 overrides per staff ID per 24 h.
* **Patient-side control:** the emergency contact receives Approve / Deny on Telegram (the chat must be linked to that patient or the callback is refused). With no reply the request auto-grants after `BREAK_GLASS_DELAY_SEC` because the patient may be unconscious. Every outcome is audited and alerts the owner (critical).
* **Accountability:** the Level 3 screen carries a watermark with the responder's name, ID and hospital; the audit chain records hospital, staff ID, designation and how access was granted (approved / auto-granted).
* **Level 2 code delivery:** pushed to the linked Telegram chat, never returned to the browser (the on-screen code only exists in `OTP_MODE=mock` outside production, or with the explicit `ALLOW_DEMO_OTP=true`). The contact can block any outstanding code. Link codes are one-time, 10 min, stored hashed.
* **Known gaps:** a responder can still talk a contact into reading out a code (the Approve/Deny flow does not have this weakness); the registry is simulated; the Telegram bot token is a high-value secret (rotate via @BotFather if leaked); auto-grant trades safety for availability by design.
* **Proxy:** `TRUST_PROXY` must equal the number of reverse proxies (2 for Vercel rewrite + Render) or all clients share one IP.
