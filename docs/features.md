# VEAP – Feature Guide

## 🔐 Security System

### OTP Verification
- A **4-digit OTP** is generated when someone scans the QR code
- In demo mode, the OTP is displayed as a toast notification
- **3 failed attempts** trigger a 2-minute lockout
- After lockout expires, the user can try again

### Rate Limiting
- Maximum **5 scans per user per 10-minute window**
- Uses `sessionStorage` to track scan frequency
- Suspicious activity (>3 scans in 2 minutes) triggers additional restrictions
- Rate-limited users see a countdown timer before they can retry

### Session Expiry
- Access sessions expire after **5 minutes**
- A visual timer bar at the top of the page shows remaining time
- When session expires, all data is hidden and the user must re-verify
- Timer changes color (green → yellow → red) as time runs out

### Scan Logging
- Every scan records: timestamp, user agent, and action type
- Actions tracked: `scan`, `otp_verified`, `otp_failed`, `emergency_override`, `misuse_reported`
- Logs are visible on the dashboard with auto-refresh every 5 seconds
- Last 50 events are stored per user

---

## 🔓 Access Levels

### 🟢 Level 1 — Public (Instant)
- Blood group
- Critical conditions (Diabetic, Asthma, etc.)
- Allergies
- Emergency instructions
- "Call Emergency Contact" button (primary contact only)
- AI Emergency Assistant

### 🟡 Level 2 — Verified (OTP Required)
- Full emergency contacts list with call buttons
- Basic medical history
- Current medications

### 🔴 Level 3 — Restricted (Emergency Override)
- Complete medical profile
- All data fields in a single view
- Requires explicit confirmation
- Logged as an override event with notification

---

## 🤖 AI Emergency Assistant

### How It Works
- **Rule-based system** — no external API calls required
- **8 emergency types**: Accident, Unconscious, Heart Attack, Allergic Reaction, Seizure, Choking, Severe Bleeding, Burns
- Each type provides: step-by-step first-aid instructions, call-to-action suggestions, and safety warnings

### Context-Aware Features
The AI assistant reads the patient's medical conditions and adds personalized alerts:

| Patient Condition | Emergency Type | Extra Alert |
|---|---|---|
| Diabetic | Unconscious | "Check blood sugar, apply glucose gel to gums" |
| Diabetic | Any | "Monitor for hypoglycemia signs" |
| Asthma | Any | "Check for inhaler, help use it" |
| Blood Thinners | Bleeding | "Bleeding harder to control, apply extra pressure" |
| Heart Condition | Heart Attack | "May have prescribed nitroglycerin" |
| Known Allergies | Allergic Reaction | Shows specific known allergens |
| Epilepsy | Seizure | "Check for medical bracelet or medication" |

---

## 📈 Scalability

### Current Architecture (MVP)
- Pure frontend: HTML/CSS/JS
- localStorage for data persistence
- Works offline for Level 1 data
- Zero server costs

### Production Migration Path
1. **Backend**: Replace localStorage with Firebase/Supabase
2. **Auth**: Real OTP via SMS (Twilio) or email
3. **Encryption**: AES-256 for stored medical data
4. **QR**: Embed encrypted tokens instead of plain user IDs
5. **API**: REST endpoints for CRUD operations
6. **Hosting**: CDN-backed static hosting + serverless functions

---

## 🔮 Future Scope

### Verified Responders
- Paramedics/doctors get verified accounts with faster access
- Badge system showing verification level
- Pre-approved Level 2/3 access for verified medical personnel

### Hospital Integration
- Auto-share patient data with receiving hospital
- HL7/FHIR standard compliance for medical data exchange
- Integration with hospital EMR systems

### Wearables & IoT
- NFC tags for contactless scanning
- Smartwatch complications with QR display
- Medical alert bracelets with embedded NFC chips

### Additional Features
- Multi-language support for international emergencies
- Voice-activated emergency mode
- Photo/document attachments (lab reports, prescriptions)
- Family/group management for parents/caregivers
- Insurance information integration
- Organ donor status display
