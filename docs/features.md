# VEAP feature status

Everything marked **Done** is implemented and covered by automated tests (see `docs/testing.md`). Nothing is marked Done unless it works in the running stack.

| Area | Feature | Status |
|---|---|---|
| Auth | Email + password (Argon2id + pepper), strength meter, 10+ chars with mixed case and digit | Done |
| Auth | JWT access tokens (15 min) + rotating refresh tokens in httpOnly/SameSite=Strict cookie, reuse detection kills the session | Done |
| Auth | TOTP MFA with authenticator QR, 8 single-use recovery codes, secret encrypted at rest | Done |
| Auth | Account lockout (5 failures / 15 min), uniform login errors, timing-equalised unknown-user path | Done |
| Auth | Device/session list and instant remote revoke (access tokens die immediately) | Done |
| Auth | Roles: patient, responder, medical_professional, admin; responder license approval workflow | Done |
| Auth | Passkeys (WebAuthn), Google OAuth, breached-password (HIBP) check, account recovery | Roadmap |
| Profile | Field-level AES-256-GCM encryption, per-user data keys wrapped by a master key (AAD bound to user+field) | Done |
| Profile | Per-field visibility (Tier 1/2/3) set by the patient, completeness score | Done |
| Profile | Document vault, OCR/NER extraction, multilingual view, dependents | Roadmap |
| QR | Signed (HMAC) 128-bit tokens, no PHI in the QR, tokens stored hashed + encrypted | Done |
| QR | Revoke / regenerate (kills live sessions), PNG download, printable wallet card | Done |
| QR | Wallet pass (Apple/Google) | Roadmap |
| Access | Tier 1 public scan, Tier 2 OTP sent to the **patient's primary emergency contact** (hashed, 5 min, 3 attempts, per-profile request cap), Tier 3 break-glass or verified-professional credential | Done |
| Access | Break-glass requires a verified Tier 2 session + written reason (min 15 chars); owner gets a critical alert | Done |
| Access | Server-enforced session expiry, single extension (+5 min), explicit end, profile-bound sessions | Done |
| Access | Real SMS delivery of OTPs through Twilio (`OTP_MODE=twilio`); mock mode for demos | Done (logic tested with a mocked Twilio API; not tested against live Twilio) |
| Access | Report misuse from the scan page (owner alerted, admin sees a security event) | Done |
| Account | Right to erasure: delete account + all data (password, and 2FA code when enabled) | Done |
| Audit | Hash-chained per-owner audit log, verify endpoint, analytics, geo capture, owner-only access | Done |
| Alerts | In-app notifications on every scan/Tier 2/Tier 3 event; auto-lock alerts | Done |
| Alerts | Push / SMS / email delivery | Roadmap (adapter point in `notify.service.ts`) |
| Abuse | Rate limits (global, auth, scan, OTP), invalid-signature + honeytoken logging, admin security-events view | Done |
| Abuse | ML anomaly scoring on every scan, auto-lock at score >= 85, owner unlock | Done |
| AI/ML | Retrieval first-aid assistant over a vetted corpus, patient-aware warnings, guardrails, voice read-aloud | Done |
| AI/ML | Triage classifier (gradient boosting, synthetic training data), drug-allergy and drug-drug checker | Done |
| AI/ML | Generative LLM answers | Roadmap (deliberately retrieval-only today) |
| Frontend | React PWA with the original VEAP dark glass design: landing, auth, dashboard (profile / QR / activity / security), emergency view, admin, responder, toasts, modals, bottom tab bar on phones | Done |
| Frontend | Live "what a stranger sees" preview, tag inputs, OTP boxes, session timer bar, wallet-card print, light error states (locked, revoked, rate-limited, offline) | Done |
| Frontend | Offline Tier 1 (service worker + localStorage fallback), live countdown, offline banner | Done |
| Ops | CI workflows, Dockerfiles + compose, seed script, e2e smoke script | Done (Docker files not executed in the build sandbox) |
| Ops | MongoDB storage (local, Docker or Atlas), `.env` auto-loading | Done |
| Ops | Redis/BullMQ, k8s/terraform | Roadmap (rate limiting is in-process today) |
