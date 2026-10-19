# API (base `/api/v1`)

Auth: `Authorization: Bearer <access token>`. Emergency endpoints are public but need the QR token (and an `X-Access-Session` header for Tier 2/3). Errors: `{ "error": "<code>", "message": "..." }`.

| Method | Path | Notes |
|---|---|---|
| POST | /auth/register, /auth/register-responder | patient / responder (pending approval) |
| POST | /auth/login → /auth/mfa/login | returns `mfaRequired` + `mfaToken` when 2FA is on |
| POST | /auth/refresh, /auth/logout | cookie + `X-Requested-With: veap` |
| GET | /auth/me, /auth/sessions · DELETE /auth/sessions/:id | |
| POST | /auth/mfa/setup, /auth/mfa/enable, /auth/mfa/disable | |
| GET/PUT | /profile · PUT /profile/visibility | patient only |
| GET/POST | /qr · POST /qr/:id/revoke, /qr/:id/unlock · GET /qr/:id/image.png | patient only |
| GET | /emergency/:token | Tier 1 (rate limited) · optional `?lat=&lng=` |
| GET | /emergency/:token/record | Tier 2/3 data, needs `X-Access-Session` |
| POST | /access/otp/request, /access/otp/verify | Tier 2 |
| POST | /access/break-glass | Tier 3, needs Tier 2 session + `reason` |
| POST | /access/credential | Tier 3, approved professional (bearer) |
| POST | /access/extend, /access/end | session lifecycle |
| GET | /audit, /audit/verify, /audit/analytics | patient only |
| GET/POST | /notifications, /notifications/read-all | |
| POST | /assistant/guide, /assistant/triage, /assistant/interactions | |
| GET/POST | /admin/responders, /admin/responders/:id/approve\|reject, /admin/security-events, /admin/stats | admin only |

ML service (internal, `x-service-key` required): `POST /anomaly/score`, `/triage/predict`, `/assistant/guide`, `/interactions/check`, `GET /health`.
