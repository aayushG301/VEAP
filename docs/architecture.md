# Architecture

```
 Browser (React PWA)  ──/api──►  Backend (Express + TypeScript)  ──►  MongoDB
   ▲   service worker              │  auth · profile · qr · access · audit · notifications · assistant · admin
   │   (Tier 1 offline)            └──x-service-key──►  ML service (FastAPI)
                                                           ├─ anomaly   (Isolation Forest + rules)
                                                           ├─ triage    (Gradient Boosting, synthetic data)
                                                           ├─ assistant (TF-IDF retrieval + guardrails)
                                                           └─ interactions (curated rule table)
```

* **Graceful degradation:** if the ML service is down or `ML_SERVICE_URL` is empty, the backend uses equivalent rule-based fallbacks (`apps/backend/src/services/fallbacks.ts`) so emergency features never depend on the ML service.
* **Why MongoDB:** the data is document-shaped (profile, sessions, audit entries) and nothing needs joins or multi-document transactions. Atomic single-document updates (`findOneAndUpdate`) guard OTP attempts, refresh-token reuse, and "extend once"; a unique `(userId, seq)` index keeps the audit chain fork-free under concurrency. Works on a standalone `mongod` or Atlas (no replica set required).
* **Single process:** rate limiting is in-memory (per instance). For multiple instances use a Redis store.

## Scan flow
1. `GET /emergency/:token` – verify HMAC signature, look up hash, record scan, score risk (ML), maybe auto-lock, audit + notify owner, return Tier 1 fields.
2. `POST /access/otp/request` → `POST /access/otp/verify` – issue a Tier 2 session (JWT + DB row, 5 min).
3. `POST /access/break-glass` (needs Tier 2 session + reason) or `POST /access/credential` (approved professional) – Tier 3 session (10 min).
4. `GET /emergency/:token/record` – returns fields whose visibility ≤ session tier, plus interaction warnings.

## Repository layout
```
apps/backend      Express API, MongoDB collections/indexes (config/db.ts), tests (vitest + supertest)
apps/frontend     React + Vite PWA, tests (vitest + testing-library)
apps/ml-service   FastAPI service, curated first-aid corpus, tests (pytest)
scripts           e2e smoke test against a running stack
docs              architecture, features, security, api, ML model cards, testing, demo script
```
