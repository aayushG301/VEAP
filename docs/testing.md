# Testing

| Suite | Command | What it covers |
|---|---|---|
| Backend (54 tests) | `npm test -w apps/backend` (needs MongoDB reachable at `MONGO_URI`; each test file uses a throwaway database that is dropped afterwards) | crypto, auth, MFA, refresh rotation/reuse, lockout, tiers, OTP abuse, break-glass, credentials, QR lifecycle, auto-lock, audit tamper detection and concurrent-writer safety, encryption at rest, rate limits, assistant |
| Frontend (30 tests) | `npm test -w apps/frontend` | API client, utilities, components (tag input, OTP boxes, modal incl. focus regression, visibility picker), landing/login/register/404, emergency page: OTP flow, locked, revoked, rate-limited, offline |
| Real browser (19 steps) | `npm run test:ui` (stack running; needs Chrome or Edge) | Drives the real UI: register, fill profile, generate QR, stranger scans on a phone-sized window, OTP, override, report misuse, alerts + audit verification, 2FA setup + login, mobile layout, revoke, invalid QR, responder approval, account deletion |
| ML service (7 tests) | `npm run test:ml` | service-key auth, anomaly separation, triage levels, retrieval + personalization, guardrails, interactions |
| End-to-end (18 checks) | `npm run test:e2e` (needs the stack running) | full scan → OTP → break-glass → audit flow, refresh rotation, admin approval, through the real ML service |

Backend tests were run against FerretDB (a MongoDB-compatible server) in the build sandbox, not against `mongod` itself; run them against your own MongoDB/Atlas too.

The real-browser suite was run with headless Chromium in the build sandbox. Not covered: Docker images, live Twilio, load/performance, third-party security audit.
