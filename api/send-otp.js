/**
 * VEAP – OTP SMS Sender
 * Serverless function (Vercel / Netlify compatible)
 *
 * Vercel:  place in /api/send-otp.js  → endpoint: /api/send-otp
 * Netlify: place in /netlify/functions/send-otp.js  → endpoint: /.netlify/functions/send-otp
 *          and change the export at the bottom to: exports.handler = netlifyHandler;
 *
 * Required environment variables (set in Vercel/Netlify dashboard):
 *   TWILIO_ACCOUNT_SID   – your Twilio Account SID
 *   TWILIO_AUTH_TOKEN    – your Twilio Auth Token
 *   TWILIO_PHONE_NUMBER  – your Twilio phone number (e.g. +12015551234)
 *
 * Optional:
 *   ALLOWED_ORIGIN       – your frontend domain for CORS (e.g. https://yourapp.netlify.app)
 */

// ─── Twilio SMS helper ─────────────────────────────────────────────────────
async function sendSMS(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio environment variables are not configured.");
  }

  // Encode credentials for Basic Auth
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const params = new URLSearchParams({
    To:   to,
    From: from,
    Body: body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method:  "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Twilio error: ${response.status}`);
  }

  return data; // contains sid, status, etc.
}

// ─── Input validation ──────────────────────────────────────────────────────
function validatePhone(phone) {
  // Must be E.164 format: +<country code><number> — 8 to 15 digits
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function validateOtp(otp) {
  return /^\d{4}$/.test(otp);
}

// ─── CORS headers ──────────────────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ─── Vercel handler (default export) ─────────────────────────────────────
export default async function handler(req, res) {
  const headers = corsHeaders(req.headers.origin);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers).end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
    return;
  }

  try {
    let body = req.body;

    // Vercel parses JSON automatically when Content-Type is application/json
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const { phone, otp, patientName } = body || {};

    // ── Validate ──
    if (!phone || !validatePhone(phone)) {
      res.writeHead(400, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: "Invalid phone number. Use E.164 format (e.g. +911234567890).",
      }));
      return;
    }

    if (!otp || !validateOtp(otp)) {
      res.writeHead(400, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: "Invalid OTP. Must be a 4-digit number.",
      }));
      return;
    }

    // ── Build SMS message ──
    const name    = patientName ? patientName.substring(0, 50) : "Unknown";
    const message =
      `🚨 VEAP Emergency Alert\n` +
      `Someone scanned the emergency QR of ${name}.\n` +
      `OTP to view medical details: ${otp}\n` +
      `Valid for 5 minutes. Do NOT share this OTP.`;

    // ── Send SMS ──
    const result = await sendSMS(phone, message);

    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      messageSid: result.sid,
      status:     result.status,
    }));
  } catch (err) {
    console.error("[VEAP send-otp] Error:", err.message);

    res.writeHead(500, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      error:   err.message || "Failed to send OTP",
    }));
  }
}

// ─── Netlify handler (named export — uncomment + change file location) ────
/*
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  try {
    const { phone, otp, patientName } = JSON.parse(event.body || "{}");

    if (!phone || !validatePhone(phone)) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ success: false, error: "Invalid phone number." }) };
    }
    if (!otp || !validateOtp(otp)) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ success: false, error: "Invalid OTP." }) };
    }

    const name    = patientName ? patientName.substring(0, 50) : "Unknown";
    const message = `🚨 VEAP Emergency Alert\nSomeone scanned the emergency QR of ${name}.\nOTP to view medical details: ${otp}\nValid for 5 minutes. Do NOT share this OTP.`;
    const result  = await sendSMS(phone, message);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, messageSid: result.sid }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
*/