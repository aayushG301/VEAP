<p align="center"><img src="apps/frontend/public/logo-full.svg" alt="VEAP" width="320" /></p>

# VEAP - Verified Emergency Access Protocol

> **Your Medical ID, Always Ready.** A QR-based emergency health-access platform: one scan gives first responders the critical facts, while the patient stays in control of everything else.

**Status:** working full-stack hackathon prototype with the original VEAP dark-glass design. Backend (54 tests), frontend (30 tests), ML service (7 tests), an 18-check API end-to-end run and a 19-step **real-browser** test all pass. See [Honest status](#honest-status).

| | |
|---|---|
| ![Landing](docs/screenshots/landing.png) | ![Emergency page on a phone](docs/screenshots/emergency-level2-mobile.png) |
| ![Profile editor](docs/screenshots/profile.png) | ![QR tab](docs/screenshots/qr.png) |

## The problem
In an emergency, responders know nothing about the patient: allergies, medications, conditions, who to call. Bracelets and cards are static and show everything to anyone; hospital records are siloed; open QR codes have no privacy at all.

## The solution
Every user gets a **signed, revocable QR code** that contains no health data. Scanning it reveals information in three levels, each needing stronger proof:

| | Level 1 - Public | Level 2 - Verified | Level 3 - Restricted |
|---|---|---|---|
| Who | Anyone who scans | Responder with a code **sent to the patient's emergency contact** | Approved professional, or emergency override with a written reason |
| Default fields | Name, blood group, allergies, emergency instructions, contacts | + conditions, medications, implants, doctor | + date of birth, insurance, history/notes |
| Session | n/a | 5 min (+5 once) | 10 min (+5 once) |
| Owner alert | Info | Warning | Critical |

The patient chooses, **per field**, which level can see it (with a live "what a stranger sees" preview), revokes the QR in one tap, and sees every access in a tamper-evident log.

## Quick start

Requirements: **Node 20.12+** (22 or 24 LTS recommended), **Python 3.10+**, and a **MongoDB** database (pick one):

* **Atlas (no install):** free cluster at mongodb.com/atlas, copy the connection string into `MONGO_URI` in `.env`.
* **Docker:** `docker run -d --name veap-mongo -p 27017:27017 mongo:7`
* **Local install:** MongoDB Community Server (default `mongodb://127.0.0.1:27017`, no config needed).

```bash
cp .env.example .env           # optional locally; set MONGO_URI here if you use Atlas
npm install                    # backend + frontend (npm workspaces)
pip install -r apps/ml-service/requirements.txt

npm run seed                   # demo accounts + a ready-to-scan QR link (the password is printed)
npm run dev:ml                 # terminal 1 (Windows: npm run dev:ml:win)   -> http://localhost:8001/docs
npm run dev:backend            # terminal 2                                   -> http://localhost:4000/health
npm run dev:frontend           # terminal 3                                   -> http://localhost:5173
```

`.env` in the project root is read automatically by the backend and the ML service (real shell variables win). The ML service is optional: without it the backend falls back to built-in rule-based logic. **Docker:** `docker compose up --build`, then open http://localhost:8080 (compose files were not run in the build sandbox).

### Demo logins (after `npm run seed`)
`patient@veap.demo`, `admin@veap.demo`, `doctor@veap.demo` (pending: approve it in the admin console). Open the QR link the seed prints in a private window to play the responder.

### Real SMS codes with Twilio
By default (`OTP_MODE=mock`) the Level 2 code is shown on screen so demos work offline. For real SMS to the patient's emergency contact:

1. Create a Twilio account; copy the **Account SID**, **Auth Token** and a Twilio **phone number**. (Trial accounts can only text numbers you have verified in Twilio.)
2. In `.env` set `OTP_MODE=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (e.g. `+15005550006`) and `DEFAULT_COUNTRY_CODE` (e.g. `+91`).
3. Restart the backend. Codes are now texted to the patient's **first emergency contact** and never sent to the browser.

## Features
Full table with status: [docs/features.md](docs/features.md).

* **Design:** the original VEAP look (dark glass, gradient shield logo, emoji icons, pulsing level pills, OTP boxes, session timer bar), mobile-first with a bottom tab bar on phones and a two-column layout on desktop; toasts, confirm modals, skeleton loaders, accessible labels, reduced-motion support.
* **Auth:** Argon2id passwords, JWT + rotating refresh tokens with reuse detection, TOTP 2FA + recovery codes, lockout, device list with instant sign-out, roles + responder approval, account deletion.
* **Privacy:** field-level AES-256-GCM, per-user keys, per-field visibility, no health data in the QR.
* **Access control:** code sent to the patient's emergency contact, break-glass with mandatory reason, server-enforced expiry, owner alerts, report-misuse button.
* **Audit:** per-owner hash chain with verification and activity timeline.
* **Abuse defense:** rate limits, signature checks, honeytokens, ML anomaly score with auto-lock.
* **AI/ML:** emergency-type assistant (retrieval over vetted first-aid guides, patient-aware warnings, read-aloud), triage classifier, drug-allergy/drug-drug checker.
* **Resilience:** installable PWA, offline Level 1 view, graceful ML fallback.

## Architecture
```
Browser (React PWA) --/api--> Backend (Express + TS) --> MongoDB
                                   '--service key--> ML service (FastAPI: anomaly, triage, assistant, interactions)
                                   '--(optional)---> Twilio (SMS)
```
[docs/architecture.md](docs/architecture.md) · [docs/security.md](docs/security.md) (threat model and known gaps) · [docs/api.md](docs/api.md) · [docs/ml-models.md](docs/ml-models.md) · [docs/demo-script.md](docs/demo-script.md)

## Project structure
```
veap/
├── apps/
│   ├── backend/        Express + TypeScript API, MongoDB (config/db.ts), 54 tests
│   │   └── src/{config,security,middleware,services,utils} + modules/{auth,profiles,qr,access,audit,notifications,assistant,admin}
│   ├── frontend/       React + Vite PWA, 30 tests
│   │   ├── public/     logo + PWA icons, manifest, service worker
│   │   └── src/{pages,features,components,lib,styles}
│   └── ml-service/     FastAPI + scikit-learn, 7 tests (data/first_aid_corpus, data/interactions.json)
├── scripts/            e2e-smoke.mjs (API), ui-e2e.mjs (real browser)
├── docs/               architecture, features, security, api, ML cards, testing, demo script, screenshots
├── .github/workflows/  ci.yml, security.yml
├── docker-compose.yml
└── .env.example
```

## Testing
```bash
npm run typecheck && npm test      # backend (needs MongoDB reachable) + frontend
npm run test:ml                    # ML service (Windows: npm run test:ml:win)
# with MongoDB, ML, backend and frontend running:
npm run test:e2e                   # 18 API checks
npm run test:ui                    # 19-step real-browser run (needs Chrome or Edge; CHROME_PATH to override)
```
Backend tests create and delete throwaway databases on your MongoDB. Details: [docs/testing.md](docs/testing.md).

## Honest status
**Built and tested:** everything listed under Features.
**Not built (roadmap):** passkeys/WebAuthn, Google OAuth, document vault + OCR, multilingual UI, wallet passes, Redis/BullMQ, generative LLM answers (the assistant is retrieval-only on purpose).
**Caveats:**
* Twilio delivery is covered by tests against a *mocked* Twilio API, not a live account.
* Backend tests and the API/browser end-to-end runs were executed in the build sandbox against FerretDB (a MongoDB-compatible server), not `mongod` itself. Please run `npm test` once against your own MongoDB or Atlas.
* The triage model is trained on synthetic data and is not clinically validated; the interaction table is small and illustrative.
* Docker files were not executed in the build sandbox. No third-party security audit; not HIPAA/GDPR certified and not for real patient data without review.

## License
MIT. Built for hackathon demonstration purposes.
