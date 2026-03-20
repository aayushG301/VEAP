/* ==========================================
   VEAP – Security Module
   OTP, rate limiting, session expiry, scan logging
   ========================================== */

const Security = {
  // ---- Configuration ----
  CONFIG: {
    SESSION_DURATION: 5 * 60, // 5 minutes in seconds
    MAX_SCANS: 5,
    SCAN_WINDOW: 10 * 60 * 1000, // 10 minutes in ms
    MAX_OTP_ATTEMPTS: 3,
    OTP_LOCKOUT_DURATION: 2 * 60 * 1000, // 2 minutes in ms
    MOCK_OTP: null, // Generated dynamically
  },

  // ---- State ----
  state: {
    sessionStart: null,
    sessionTimer: null,
    sessionCountdown: null,
    otpAttempts: 0,
    otpLocked: false,
    otpLockUntil: 0,
    currentOtp: null,
    level2Unlocked: false,
    level3Unlocked: false,
  },

  // ---- OTP System ----
  generateOTP() {
    this.state.currentOtp = Math.floor(1000 + Math.random() * 9000).toString();
    return this.state.currentOtp;
  },

  verifyOTP(input) {
    if (this.state.otpLocked) {
      const remaining = Math.ceil((this.state.otpLockUntil - Date.now()) / 1000);
      if (remaining > 0) {
        return { success: false, error: `Too many attempts. Try again in ${remaining}s`, locked: true };
      }
      this.state.otpLocked = false;
      this.state.otpAttempts = 0;
    }

    if (input === this.state.currentOtp) {
      this.state.otpAttempts = 0;
      this.state.level2Unlocked = true;
      return { success: true };
    }

    this.state.otpAttempts++;

    if (this.state.otpAttempts >= this.CONFIG.MAX_OTP_ATTEMPTS) {
      this.state.otpLocked = true;
      this.state.otpLockUntil = Date.now() + this.CONFIG.OTP_LOCKOUT_DURATION;
      return {
        success: false,
        error: `Too many failed attempts. Locked for 2 minutes.`,
        locked: true
      };
    }

    return {
      success: false,
      error: `Invalid OTP. ${this.CONFIG.MAX_OTP_ATTEMPTS - this.state.otpAttempts} attempts remaining.`,
      locked: false
    };
  },

  // ---- Rate Limiting ----
  checkRateLimit(userId) {
    const key = `veap_rate_${userId}`;
    let data;
    try {
      data = JSON.parse(sessionStorage.getItem(key)) || { scans: [] };
    } catch {
      data = { scans: [] };
    }

    const now = Date.now();
    // Filter scans within window
    data.scans = data.scans.filter(t => now - t < this.CONFIG.SCAN_WINDOW);

    if (data.scans.length >= this.CONFIG.MAX_SCANS) {
      return {
        limited: true,
        remaining: 0,
        resetIn: Math.ceil((data.scans[0] + this.CONFIG.SCAN_WINDOW - now) / 1000)
      };
    }

    // Add this scan
    data.scans.push(now);
    sessionStorage.setItem(key, JSON.stringify(data));

    return {
      limited: false,
      remaining: this.CONFIG.MAX_SCANS - data.scans.length,
      resetIn: 0
    };
  },

  isSuspicious(userId) {
    const key = `veap_rate_${userId}`;
    let data;
    try {
      data = JSON.parse(sessionStorage.getItem(key)) || { scans: [] };
    } catch {
      data = { scans: [] };
    }
    // Suspicious if more than 3 scans in 2 minutes
    const now = Date.now();
    const recentScans = data.scans.filter(t => now - t < 2 * 60 * 1000);
    return recentScans.length > 3;
  },

  // ---- Session Management ----
  startSession(onTick, onExpire) {
    this.state.sessionStart = Date.now();
    let remaining = this.CONFIG.SESSION_DURATION;

    // Update timer bar UI
    if (onTick) onTick(remaining, this.CONFIG.SESSION_DURATION);

    this.state.sessionCountdown = setInterval(() => {
      remaining--;

      if (onTick) onTick(remaining, this.CONFIG.SESSION_DURATION);

      if (remaining <= 0) {
        this.expireSession();
        if (onExpire) onExpire();
      }
    }, 1000);
  },

  expireSession() {
    if (this.state.sessionCountdown) {
      clearInterval(this.state.sessionCountdown);
      this.state.sessionCountdown = null;
    }
    this.state.level2Unlocked = false;
    this.state.level3Unlocked = false;
    this.state.otpAttempts = 0;
    this.state.currentOtp = null;
  },

  isSessionActive() {
    if (!this.state.sessionStart) return false;
    return (Date.now() - this.state.sessionStart) < (this.CONFIG.SESSION_DURATION * 1000);
  },

  // ---- Emergency Override (Level 3) ----
  emergencyOverride(userId) {
    this.state.level3Unlocked = true;
    this.state.level2Unlocked = true; // Unlock level 2 as well
    // Log the override event
    VEAP.addScanEvent(userId, 'emergency_override');
    return true;
  },

  // ---- Cleanup ----
  cleanup() {
    if (this.state.sessionCountdown) {
      clearInterval(this.state.sessionCountdown);
    }
  }
};
