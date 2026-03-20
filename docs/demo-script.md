# VEAP – Demo Script (2–3 Minutes)

## Setup Before Demo

1. Deploy to Netlify/Vercel OR run locally with `npx serve .`
2. Have two devices ready: **laptop** (dashboard) + **phone** (scanner)
3. Pre-fill a test profile if you want to save time during the demo

---

## Demo Flow

### 🎬 Opening (15 seconds)

> "Imagine someone collapses on the street. You want to help, but you don't know their medical conditions, allergies, or who to call. **VEAP solves this** — it's a QR-based emergency medical ID system with smart privacy controls."

### 📱 Step 1: Create a Profile (45 seconds)

1. Open the **Dashboard** on the laptop
2. Fill in the form:
   - Name: **"Raj Patel"**
   - Blood Group: **O+**
   - Conditions: Add **"Diabetic"** and **"Asthma"**
   - Allergies: **"Penicillin"**
   - Emergency Instructions: **"I carry an EpiPen in my left jacket pocket"**
   - Emergency Contact: **Mom — 9876543210**
3. Click **"Save & Generate QR Code"**

> "In under a minute, Raj has created his emergency medical ID. This QR code can go on his phone case, wallet, or wearable."

### 🔍 Step 2: Scan the QR (30 seconds)

1. Scan the QR code with your **phone camera**
2. Show the **Level 1 (Public) data** that appears instantly:
   - Blood group, conditions, allergies
   - Emergency instructions
   - "Call Emergency Contact" button

> "A bystander scans Raj's QR — instantly they see his blood type, he's diabetic, allergic to Penicillin, and there's a one-tap button to call his mom."

### 🤖 Step 3: AI Assistant (30 seconds)

1. On the phone, tap **"Unconscious"** in the AI Emergency Assistant
2. Show the context-aware steps

> "Our AI assistant detects Raj is diabetic and unconscious — it adds a specific alert to check blood sugar. These are context-aware, personalized first-aid steps."

### 🔐 Step 4: Security Layers (45 seconds)

1. Show the **OTP verification** section
2. Enter the demo OTP shown on screen
3. Show **Level 2 data** unlocking (contacts, medical history)

> "Sensitive data like medical history requires OTP verification. This prevents random strangers from accessing private information."

4. Show the **Emergency Override** button
5. Click it, confirm on the modal
6. Show **Level 3 — full medical profile** unlocking

> "In a real emergency, responders can override the lock — but it's logged, timestamped, and the patient is notified."

### 🛡️ Step 5: Security Features (15 seconds)

Switch to the **laptop dashboard** and show:
- Scan log showing the scan events
- OTP verification log
- Emergency override log

> "Every scan, verification, and override is logged. Raj can see exactly who accessed his data and when."

### 🎯 Closing (15 seconds)

> "VEAP is simple, secure, and immediately useful. No app to install, no login required for the scanner, and privacy is built into every layer. It could save a life."

---

## Key Points to Emphasize

| Feature | Talking Point |
|---------|--------------|
| **No App Needed** | Scanner just uses their phone camera |
| **Privacy First** | Data revealed progressively with verification |
| **Context-Aware AI** | Adjusts first-aid based on patient conditions |
| **Abuse Prevention** | Rate limiting, session expiry, scan logging |
| **Accessible** | Large buttons, high contrast, mobile-first |

## Potential Judge Questions & Answers

**Q: How is data stored securely?**
> In this MVP, data is in localStorage. In production, we'd use Firebase with encryption and auth tokens embedded in the QR.

**Q: Can someone just screenshot the QR?**
> The session expires in 5 minutes, scans are logged, and sensitive data requires OTP. A screenshot only gives Level 1 access.

**Q: What about no internet?**
> We detect offline status and show a banner. Level 1 data (cached) would still be available.

**Q: How does this scale?**
> The architecture is designed for a backend migration — replace localStorage with Firebase/Supabase and you have a production-ready system.
