<p align="center"><img src="apps/frontend/public/logo-full.svg" alt="VEAP" width="320" /></p>

# VEAP - Verified Emergency Access Protocol

> **Your Medical ID, Always Ready.** A QR-based emergency health-access platform: one scan gives first responders the critical facts, while the patient stays in control of everything else.

**Status:** working full-stack hackathon prototype with the original VEAP dark-glass design. Backend (71 tests), frontend (37 tests), ML service (7 tests), an 18-check API end-to-end run and a 19-step **real-browser** test all pass. See [Honest status](#honest-status).

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
| Who | Anyone who scans | Responder with a code **sent privately to the patient's emergency contact** (Telegram) | **Authenticated hospital staff** (hospital ID + council ID + PIN, registry-checked) after the contact can deny, or an admin-approved professional account |
| Default fields | Name, blood group, allergies, emergency instructions, contacts | + conditions, medications, prescriptions (dose, prescriber), allergy reactions, implants, doctor | + date of birth, surgeries, vaccinations, DNR / advance directives, implant MRI safety, specialists, preferred hospital, insurance + TPA, notes |
| Session | n/a | 5 min (+5 once) | 10 min (+5 once), responder identity watermarked |
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

### Level 2 codes with Telegram (free forever)
`OTP_MODE=telegram` pushes the code to the emergency contact's Telegram chat, so it never appears on the responder's screen.

1. In Telegram, talk to **@BotFather**, send `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN` in `.env`, and set `OTP_MODE=telegram`.
2. Start the backend, log in as the patient, open **Security → Emergency contact alerts → Connect emergency contact**, and open the link (or scan the QR) on the contact's phone. Tap **Start**.
3. Scanning the QR now sends the code to that chat, with a **Block** button. Level 3 requests arrive there too, with **Approve / Deny**.

The bot uses long polling, so there is no webhook or public URL to configure. Paid SMS via Twilio is still supported (`OTP_MODE=twilio`). **Hosting for free (Atlas + Render + Vercel): see [docs/DEPLOY.md](docs/DEPLOY.md).**

### Level 3: simulated hospital registry
`npm run seed` (or `DEMO_SEED=true` at boot) loads a **simulated** hospital and medical-council registry. Everything around it is real: argon2id-hashed PINs, lockout after repeated wrong PINs, suspended hospitals and revoked licences refused with one identical message, a daily override limit per staff ID, the contact's Approve/Deny with a timed auto-grant, a full audit trail, owner alerts, and the responder's identity watermarked on screen. A real deployment replaces the seeded collection with a lookup against the national medical register and hospital HR systems.

| Hospital ID | Staff / council ID | PIN | Result |
|---|---|---|---|
| HSP-DEL-0001 | NMC-DL-48213 (Dr. Ananya Rao) | 482913 | accepted |
| HSP-MRT-0002 | NMC-UP-30517 (Dr. Vikram Singh) | 305172 | accepted |
| HSP-MRT-0002 | NMC-UP-77002 (Meena Joshi, nurse) | 770021 | accepted |
| HSP-DEL-0001 | NMC-DL-99999 (revoked licence) | 999999 | refused |
| HSP-LKO-0003 | NMC-UP-11111 (suspended hospital) | 111111 | refused |

## Features
Full table with status: [docs/features.md](docs/features.md).

* **Design:** the original VEAP look (dark glass, gradient shield logo, emoji icons, pulsing level pills, OTP boxes, session timer bar), mobile-first with a bottom tab bar on phones and a two-column layout on desktop; toasts, confirm modals, skeleton loaders, accessible labels, reduced-motion support.
* **Auth:** Argon2id passwords, JWT + rotating refresh tokens with reuse detection, TOTP 2FA + recovery codes, lockout, device list with instant sign-out, roles + responder approval, account deletion.
* **Privacy:** field-level AES-256-GCM, per-user keys, per-field visibility, no health data in the QR.
* **Access control:** code sent privately to the patient's emergency contact (Telegram), contact can block it; Level 3 needs registry-verified hospital staff + PIN + contact Approve/Deny (timed auto-grant), per-staff limits and lockout, identity watermark, server-enforced expiry, owner alerts, report-misuse button.
* **Audit:** per-owner hash chain with verification and activity timeline.
* **Abuse defense:** rate limits, signature checks, honeytokens, ML anomaly score with auto-lock.
* **AI/ML:** emergency-type assistant (retrieval over vetted first-aid guides, patient-aware warnings, read-aloud), triage classifier, drug-allergy/drug-drug checker.
* **Resilience:** installable PWA, offline Level 1 view, graceful ML fallback.

## Architecture
```
Browser (React PWA) --/api--> Backend (Express + TS) --> MongoDB
                                   '--service key--> ML service (FastAPI: anomaly, triage, assistant, interactions)
                                   '--(OTP_MODE=telegram)--> Telegram Bot API (free)
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
* Telegram and Twilio delivery are covered by tests against *mocked* APIs (api.telegram.org / api.twilio.com), not live accounts. Try Telegram once with your own bot token.
* The Level 3 hospital/council registry is **simulated** (seeded data). Staff IDs are not verified against a real medical register.
* Backend tests and the API/browser end-to-end runs were executed in the build sandbox against FerretDB (a MongoDB-compatible server), not `mongod` itself. Please run `npm test` once against your own MongoDB or Atlas.
* The triage model is trained on synthetic data and is not clinically validated; the interaction table is small and illustrative.
* Docker files were not executed in the build sandbox. No third-party security audit; not HIPAA/GDPR certified and not for real patient data without review.

## License
MIT. Built for hackathon demonstration purposes.
