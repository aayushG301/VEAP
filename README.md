# VEAP – Verified Emergency Access Protocol

> A QR-based emergency healthcare system with intelligent access control, security layers, and AI-powered first-aid guidance.

![Demo](https://img.shields.io/badge/Status-MVP%20Ready-brightgreen) ![Stack](https://img.shields.io/badge/Stack-HTML%2FCSS%2FJS-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Quick Start

### Run Locally

1. Clone or download this project
2. Open `index.html` in any modern browser

**OR** use a local server (recommended for QR links to work properly):

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx -y serve .

# Using VS Code
# Install "Live Server" extension → Right-click index.html → "Open with Live Server"
```

3. Navigate to `http://localhost:8000` (or the port shown)

### Deploy (Free Hosting)

**Netlify (Recommended):**
1. Go to [netlify.com](https://netlify.com) → Sign up
2. Drag and drop the entire `VEAP/` folder
3. Done! Your site is live at `https://your-site.netlify.app`

**GitHub Pages:**
1. Push code to a GitHub repository
2. Go to Settings → Pages → Source: main branch → Root
3. Site deploys at `https://username.github.io/VEAP`

**Vercel:**
1. Go to [vercel.com](https://vercel.com) → Import Git Repository
2. Deploy with default settings

## Project Structure

```
VEAP/
├── index.html           # Landing page
├── dashboard.html       # User registration + QR generation
├── emergency.html       # Emergency viewer (QR scan destination)
├── css/
│   └── styles.css       # Complete design system
├── js/
│   ├── app.js           # Shared utilities + storage
│   ├── dashboard.js     # Dashboard logic
│   ├── emergency.js     # Emergency viewer + access levels
│   ├── security.js      # OTP, rate limiting, session expiry
│   ├── ai-assistant.js  # Rule-based AI emergency guide
│   └── qr-generate.js   # QR code generation
├── docs/
│   ├── demo-script.md   # 2-3 min demo walkthrough
│   └── features.md      # Feature guide + future scope
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS, JavaScript (ES6+) |
| Storage | localStorage (browser-based) |
| QR Generation | [qrcode-generator](https://github.com/nicklockwood/qrcode-generator) via CDN |
| Fonts | Inter (Google Fonts) |
| Hosting | Any static host (Netlify, Vercel, GitHub Pages) |

## Features at a Glance

- 🏥 **3-Level Access Control** — Public → Verified → Restricted
- 📱 **QR Code Generation** — Unique emergency profile QR for each user
- 🔐 **OTP Verification** — Mock OTP system with lockout protection
- ⏱️ **Session Expiry** — Auto-expire after 5 minutes
- 🚫 **Rate Limiting** — Block suspicious repeated scans
- 🤖 **AI Emergency Assistant** — Context-aware first-aid instructions
- 📊 **Scan Logging** — Track every access attempt
- 📱 **Mobile-First Design** — Optimized for phone scanning
- 🌐 **Offline Detection** — Fallback banner when offline

---

*Built for hackathon demo purposes. VEAP © 2026.*
