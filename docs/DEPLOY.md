# Free, always-on demo: MongoDB Atlas + Render + Vercel + Telegram

Goal: a public HTTPS link that judges can scan from any phone. Everything below is free. No ML service is needed.

```
Judge's phone ──► Vercel (React PWA, HTTPS)  ──/api rewrite──►  Render (backend)  ──►  MongoDB Atlas
                                                                      └──► Telegram Bot API (codes + approve/deny to the emergency contact)
```

## 1. Rotate anything that was ever shared
If an older `.env` with a real Atlas password left your machine (e.g. in a zip), change that database user's password in Atlas first. The new `.env` in this project contains only freshly generated secrets.

## 2. MongoDB Atlas (free M0)
1. Create a free **M0** cluster, a database user, and under **Network Access** add `0.0.0.0/0` (Render's free tier has no fixed IP).
2. Copy the connection string: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net` (URL-encode special characters in the password).

## 3. Telegram bot (free forever)
1. In Telegram open **@BotFather**, send `/newbot`, pick a name and a username (e.g. `veap_alerts_bot`).
2. Copy the token it gives you (`123456:ABC...`). This is `TELEGRAM_BOT_TOKEN`.

## 4. Backend on Render
1. Push this project to GitHub. In Render choose **New → Blueprint** and select the repo (it reads `render.yaml`), or create a Web Service by hand: build `npm install --workspace apps/backend`, start `npm start --workspace apps/backend`, health check `/health`.
2. Fill in the variables Render asks for: `MONGO_URI`, `TELEGRAM_BOT_TOKEN`, `DEMO_PASSWORD` (your choice), and leave `PUBLIC_URL` / `CORS_ORIGINS` for step 6.
3. Deploy. In the logs you should see `[demo] demo data ready` and `[telegram] bot @... polling`.

## 5. Frontend on Vercel
1. **Add New → Project**, import the same repo, set **Root Directory** to `apps/frontend`.
2. Edit `apps/frontend/vercel.json`: replace `YOUR-BACKEND.onrender.com` with your Render hostname, commit, push.
3. Deploy. You get `https://<your-app>.vercel.app`.

## 6. Connect the two
In Render set `PUBLIC_URL` and `CORS_ORIGINS` to `https://<your-app>.vercel.app` (no trailing slash) and let it redeploy. QR codes encode `PUBLIC_URL`, so this is what makes the QR work on other devices.

`TRUST_PROXY=2` (already in `render.yaml`) is required because two proxies sit in front of the backend (Vercel, then Render). With 1, every visitor would look like the same IP and the rate limits and scan-anomaly score would be wrong.

## 7. Prepare the demo (5 minutes, once)
1. Open `https://<your-app>.vercel.app`, log in as **patient@veap.demo** with your `DEMO_PASSWORD`.
2. **Security tab → Emergency contact alerts → Connect emergency contact.** Open the link (or scan the QR) on the phone that will play "the emergency contact", tap **Start** in Telegram, then **Send test message**.
3. **My QR tab**: the QR shown is the one to print or show on a screen. (The backend log also prints the link at every boot.)
4. Optional: keep the backend awake. Render's free tier sleeps after ~15 min idle (first request then takes ~50 s). Add a free UptimeRobot monitor on `https://<backend>.onrender.com/health` every 5 minutes, and open the site yourself right before judging.

## 8. The demo script
1. A judge scans the QR → **Level 1** appears instantly (name, blood group, allergies, contacts, call button).
2. They tap **Send code to the emergency contact**. The code does **not** appear on their screen. It arrives in the contact's Telegram (with a "Not an emergency: block" button). Read it out → **Level 2** (medications with interaction warnings, prescriptions, allergy reactions).
3. **Emergency override** asks for hospital ID, council/staff ID and PIN. Use the "🧪 Demo only" box to fill a valid identity, then show a **refused** one (revoked licence, or a wrong PIN five times to see the lockout).
4. After a valid sign-in the contact's Telegram shows **Approve / Deny**. Deny → the responder is blocked and the patient is alerted. Approve (or wait ~45 s) → **Level 3**: full record, DNR and advance directives, surgeries, vaccinations, MRI-safety of implants, specialists, insurance/TPA, with the responder's name and ID watermarked across the screen.
5. Back on the patient's **Activity** tab: every step is listed, with a verifiable hash chain.

## Fallbacks
* **Telegram unreachable / contact not set up:** set `ALLOW_DEMO_OTP=true` and `OTP_MODE=mock` on Render. The Level 2 code then shows on screen with a demo banner. Turn it off afterwards.
* **Quick local demo over the internet:** `cloudflared tunnel --url http://localhost:5173` (or ngrok), set `PUBLIC_URL` and `CORS_ORIGINS` in `.env` to the tunnel URL, restart the backend. `vite.config.ts` already allows tunnel hostnames.
* **Same Wi-Fi only:** use your PC's LAN IP for `PUBLIC_URL`; phones then lack location and offline features (they need HTTPS).

## Environment reference (backend)
| Variable | Meaning |
|---|---|
| `OTP_MODE` | `telegram` (free, recommended) · `twilio` (paid SMS) · `mock` (on-screen code, dev only) |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TRUST_PROXY` | Proxies in front of the backend: 0 local, 1 Render only, 2 Vercel + Render |
| `DEMO_SEED` / `DEMO_PASSWORD` | Create demo patient, QR and the simulated hospital registry at boot |
| `BREAK_GLASS_DELAY_SEC` | Seconds the contact has to deny a Level 3 request before it auto-grants (default 60) |
| `BREAK_GLASS_MAX_PER_DAY` | Overrides per staff ID per 24 h (default 3) |
| `STAFF_PIN_MAX_FAILURES` / `STAFF_LOCK_MINUTES` | Staff PIN lockout (default 5 / 15) |
| `ALLOW_DEMO_OTP` | Emergency fallback that shows the Level 2 code on screen in production. Keep `false` |
