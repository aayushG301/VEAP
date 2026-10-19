# Contributing

1. `npm install` at the repo root (npm workspaces), `pip install -r apps/ml-service/requirements.txt`.
2. Run the checks before every PR: `npm run typecheck && npm test && npm run test:ml`.
3. Security-sensitive changes (auth, access tiers, crypto, audit) need a test in `apps/backend/tests`.
4. Never log or commit secrets, OTPs, tokens, or patient data.
