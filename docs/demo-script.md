# 3-minute demo script

Setup: start MongoDB, then `npm run seed` (prints a QR link and demo logins), start the three services, open the QR link on a phone-sized window.

1. **Hook (20s)** - "In an emergency, responders know nothing about the person in front of them."
2. **Patient side (30s)** - log in as patient@veap.demo, show profile visibility selectors, QR tab, enable 2FA.
3. **Tier 1 scan (30s)** - open the QR link: blood group, allergies, call buttons. Toggle airplane mode: cached view still shows.
4. **Level 2 (30s)** - enter any phone number and tap "Send code": the code goes to the patient's emergency contact (in demo mode it is shown on screen; with Twilio configured it is a real SMS). Enter it: conditions/medications unlock with red drug-allergy warnings and a 5-minute timer bar.
5. **Break-glass (30s)** - enter a reason; full record opens. Switch to the patient dashboard: critical alert appeared.
6. **Assistant (15s)** - tap "Chest pain": steps plus patient-specific "no aspirin / on blood thinner" warnings; "Read aloud".
7. **Security finale (25s)** - Activity tab: "Verify log integrity". Then scan the QR rapidly in another tab until it auto-locks, and unlock it from the dashboard.
