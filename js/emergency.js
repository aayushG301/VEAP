/* ==========================================
   VEAP – Emergency Viewer Logic
   Handles all 3 access levels, OTP, session,
   AI assistant, and edge cases.
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ---- DOM References ----
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const rateLimitState = document.getElementById('rateLimitState');
  const rateLimitTimer = document.getElementById('rateLimitTimer');
  const expiredState = document.getElementById('expiredState');
  const emergencyContent = document.getElementById('emergencyContent');

  // Level 1
  const patientName = document.getElementById('patientName');
  const bloodGroupBadge = document.getElementById('bloodGroupBadge');
  const conditionBadges = document.getElementById('conditionBadges');
  const emergencyInstructionsCard = document.getElementById('emergencyInstructionsCard');
  const emergencyInstructionsText = document.getElementById('emergencyInstructionsText');
  const allergiesCard = document.getElementById('allergiesCard');
  const allergiesText = document.getElementById('allergiesText');
  const primaryContactCall = document.getElementById('primaryContactCall');
  const callPrimaryBtn = document.getElementById('callPrimaryBtn');
  const primaryContactLabel = document.getElementById('primaryContactLabel');

  // AI
  const emergencyTypeGrid = document.getElementById('emergencyTypeGrid');
  const aiResponseContainer = document.getElementById('aiResponseContainer');

  // Level 2
  const otpSection = document.getElementById('otpSection');
  const level2Data = document.getElementById('level2Data');
  const otpInputs = document.querySelectorAll('.otp-input');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const otpError = document.getElementById('otpError');
  const otpHint = document.getElementById('otpHint');
  const contactsList = document.getElementById('contactsList');

  // Level 3
  const overrideSection = document.getElementById('overrideSection');
  const overrideBtn = document.getElementById('overrideBtn');
  const level3Data = document.getElementById('level3Data');
  const overrideModal = document.getElementById('overrideModal');
  const cancelOverrideBtn = document.getElementById('cancelOverrideBtn');
  const confirmOverrideBtn = document.getElementById('confirmOverrideBtn');
  const fullProfileData = document.getElementById('fullProfileData');

  // Session
  const sessionBar = document.getElementById('sessionBar');
  const sessionLabel = document.getElementById('sessionLabel');

  // Report
  const reportMisuseBtn = document.getElementById('reportMisuseBtn');
  const reportMisuseFromRate = document.getElementById('reportMisuseFromRate');
  const reportModal = document.getElementById('reportModal');
  const cancelReportBtn = document.getElementById('cancelReportBtn');
  const confirmReportBtn = document.getElementById('confirmReportBtn');

  // Reload
  const reloadBtn = document.getElementById('reloadBtn');

  let userId = null;
  let userData = null;

  // ---- Initialize ----
  init();

  function init() {
    userId = VEAP.getQueryParam('id');

    if (!userId) {
      showError();
      return;
    }

    // Check rate limit first
    const rateCheck = Security.checkRateLimit(userId);
    if (rateCheck.limited) {
      showRateLimit(rateCheck.resetIn);
      return;
    }

    // Load user data
    userData = VEAP.getUser(userId);

    if (!userData) {
      showError();
      return;
    }

    // Log the scan
    VEAP.addScanLog(userId);

    // Start session
    Security.startSession(
      (remaining, total) => {
        const pct = (remaining / total) * 100;
        sessionBar.style.width = `${pct}%`;
        sessionLabel.textContent = VEAP.formatCountdown(remaining);

        // Change color when low
        if (remaining <= 60) {
          sessionLabel.style.color = 'var(--emergency-red)';
        } else if (remaining <= 120) {
          sessionLabel.style.color = 'var(--warning-amber)';
        }
      },
      () => {
        // Session expired
        handleSessionExpiry();
      }
    );

    // Generate OTP
    const otp = Security.generateOTP();
    // Security Fix: OTP is no longer shown on screen for anyone to see
    otpHint.textContent = `OTP sent to registered mobile number ending in ...${userData.contacts && userData.contacts[0] ? userData.contacts[0].phone.slice(-4) : '****'}`;

    // Simulate OTP delivery to contact number
    setTimeout(() => {
      const primaryContact = userData.contacts && userData.contacts[0] ? userData.contacts[0].name : 'Primary Contact';
      const phone = userData.contacts && userData.contacts[0] ? userData.contacts[0].phone : '********';
      VEAP.showToast(`💬 SMS sent to ${primaryContact} (${phone}): "Your VEAP OTP is ${otp}"`, 'info');
      console.log(`[DEMO ONLY] OTP sent to ${phone}: ${otp}`);
    }, 1500);

    // Simulate scan notification to owner and contacts
    setTimeout(() => {
      const ownerName = userData.name || 'Profile Owner';
      VEAP.showToast(`📡 Alert sent to ${ownerName}: "Your Emergency QR was scanned!"`, 'warning');
      
      // Also notify primary emergency contact
      if (userData.contacts && userData.contacts[0]) {
        const primary = userData.contacts[0];
        VEAP.showToast(`🔔 Notification sent to ${primary.name} (${primary.phone}): "Emergency alert for ${ownerName}"`, 'error');
        console.log(`[DEMO ONLY] Scan notification sent to ${primary.phone}`);
      }
    }, 2500);

    // Show content
    showEmergencyContent();
  }

  // ---- State Management ----
  function showError() {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    document.getElementById('sessionTimer').classList.add('hidden');
    sessionLabel.classList.add('hidden');
  }

  function showRateLimit(seconds) {
    loadingState.classList.add('hidden');
    rateLimitState.classList.remove('hidden');
    document.getElementById('sessionTimer').classList.add('hidden');
    sessionLabel.classList.add('hidden');

    let remaining = seconds;
    rateLimitTimer.textContent = VEAP.formatCountdown(remaining);

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
        window.location.reload();
      }
      rateLimitTimer.textContent = VEAP.formatCountdown(remaining);
    }, 1000);
  }

  function handleSessionExpiry() {
    // Re-hide Level 2 data and restore OTP section
    level2Data.classList.add('hidden');
    otpSection.classList.remove('hidden');

    // Re-hide Level 3 data and restore override section
    level3Data.classList.add('hidden');
    overrideSection.classList.remove('hidden');

    // Hide main content and show expired state
    emergencyContent.classList.add('hidden');
    expiredState.classList.remove('hidden');

    // Hide session timer bar
    document.getElementById('sessionTimer').classList.add('hidden');
    sessionLabel.classList.add('hidden');

    VEAP.showToast('Session expired for security', 'warning');
  }

  function showEmergencyContent() {
    loadingState.classList.add('hidden');
    emergencyContent.classList.remove('hidden');
    renderLevel1();
    renderAIAssistant();
    setupOTP();
    setupOverride();
    setupReport();
  }

  // ---- LEVEL 1: Public Data ----
  function renderLevel1() {
    // Name
    patientName.textContent = `🧑 ${userData.name}`;

    // Blood group
    bloodGroupBadge.textContent = `🩸 ${userData.bloodGroup}`;

    // Age
    if (userData.age) {
      patientName.textContent += ` (Age: ${userData.age})`;
    }

    // Conditions
    if (userData.conditions && userData.conditions.length > 0) {
      conditionBadges.innerHTML = userData.conditions.map(c =>
        `<span class="badge badge--condition">⚠️ ${escapeHtml(c)}</span>`
      ).join(' ');
    }

    // Emergency instructions
    if (userData.emergencyInstructions) {
      emergencyInstructionsCard.classList.remove('hidden');
      emergencyInstructionsText.textContent = userData.emergencyInstructions;
    }

    // Allergies (critical - shown at Level 1)
    if (userData.allergies) {
      allergiesCard.classList.remove('hidden');
      allergiesText.textContent = userData.allergies;
    }

    // Primary emergency contact call button
    if (userData.contacts && userData.contacts.length > 0) {
      const primary = userData.contacts[0];
      if (primary.phone) {
        primaryContactCall.classList.remove('hidden');
        callPrimaryBtn.href = `tel:${primary.phone}`;
        callPrimaryBtn.textContent = `📞 Call ${primary.name || 'Emergency Contact'}`;
        primaryContactLabel.textContent = `${primary.relationship || 'Emergency Contact'} · ${primary.phone}`;
      }
    }
  }

  // ---- AI Emergency Assistant ----
  function renderAIAssistant() {
    const types = AIAssistant.emergencyTypes;

    emergencyTypeGrid.innerHTML = Object.entries(types).map(([key, val]) => `
      <button type="button" class="emergency-type-btn" data-type="${key}" id="ai-${key}">
        <span class="emergency-type-btn__icon">${val.icon}</span>
        <span>${val.label}</span>
      </button>
    `).join('');

    emergencyTypeGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.emergency-type-btn');
      if (!btn) return;

      // Toggle active state
      emergencyTypeGrid.querySelectorAll('.emergency-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.type;
      const response = AIAssistant.getResponse(type, userData);
      AIAssistant.renderResponse(response, aiResponseContainer);

      // Scroll to response
      setTimeout(() => {
        aiResponseContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  }

  // ---- LEVEL 2: OTP Verification ----
  function setupOTP() {
    // Auto-focus and auto-advance OTP inputs
    otpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val && index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        }
        // Auto-submit when all filled
        if (index === otpInputs.length - 1 && val) {
          verifyOtp();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          otpInputs[index - 1].focus();
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (pasted.length === 4 && /^\d{4}$/.test(pasted)) {
          otpInputs.forEach((inp, i) => { inp.value = pasted[i]; });
          verifyOtp();
        }
      });
    });

    verifyOtpBtn.addEventListener('click', verifyOtp);
  }

  function verifyOtp() {
    const otp = Array.from(otpInputs).map(i => i.value).join('');

    if (otp.length !== 4) {
      showOtpError('Please enter all 4 digits');
      return;
    }

    const result = Security.verifyOTP(otp);

    if (result.success) {
      // Success — unlock Level 2
      VEAP.addScanEvent(userId, 'otp_verified');
      VEAP.showToast('✅ Verified! Level 2 data unlocked', 'success');

      otpSection.classList.add('hidden');
      level2Data.classList.remove('hidden');
      level2Data.classList.add('animate-in');

      renderLevel2Data();
    } else {
      VEAP.addScanEvent(userId, 'otp_failed');
      showOtpError(result.error);

      if (result.locked) {
        verifyOtpBtn.disabled = true;
        otpInputs.forEach(i => i.disabled = true);

        // Re-enable after lockout
        setTimeout(() => {
          verifyOtpBtn.disabled = false;
          otpInputs.forEach(i => { i.disabled = false; i.value = ''; });
          otpInputs[0].focus();
          hideOtpError();
        }, Security.CONFIG.OTP_LOCKOUT_DURATION);
      }

      // Shake animation
      otpSection.style.animation = 'none';
      setTimeout(() => { otpSection.style.animation = ''; }, 10);

      // Clear inputs
      otpInputs.forEach(i => i.value = '');
      otpInputs[0].focus();
    }
  }

  function showOtpError(msg) {
    otpError.textContent = msg;
    otpError.classList.remove('hidden');
  }

  function hideOtpError() {
    otpError.classList.add('hidden');
  }

  // ---- Level 2 Data Rendering ----
  function renderLevel2Data() {
    // Emergency contacts
    if (userData.contacts && userData.contacts.length > 0) {
      contactsList.innerHTML = userData.contacts.map(c => `
        <div class="contact-card">
          <div class="contact-card__info">
            <h4>${escapeHtml(c.name)}</h4>
            <p>${escapeHtml(c.relationship || 'Contact')} · ${escapeHtml(c.phone)}</p>
          </div>
          <a href="tel:${escapeHtml(c.phone)}" class="contact-card__action" title="Call ${escapeHtml(c.name)}">📞</a>
        </div>
      `).join('');
    }

    // Medical History
    if (userData.medicalHistory) {
      document.getElementById('medHistorySection').classList.remove('hidden');
      document.getElementById('medHistoryText').textContent = userData.medicalHistory;
    }

    // Medications
    if (userData.medications) {
      document.getElementById('medicationsSection').classList.remove('hidden');
      document.getElementById('medicationsText').textContent = userData.medications;
    }
  }

  // ---- LEVEL 3: Emergency Override ----
  function setupOverride() {
    overrideBtn.addEventListener('click', () => {
      overrideModal.classList.add('active');
    });

    cancelOverrideBtn.addEventListener('click', () => {
      overrideModal.classList.remove('active');
    });

    overrideModal.addEventListener('click', (e) => {
      if (e.target === overrideModal) overrideModal.classList.remove('active');
    });

    confirmOverrideBtn.addEventListener('click', () => {
      Security.emergencyOverride(userId);
      overrideModal.classList.remove('active');

      // Always unlock and show Level 2 data when Level 3 is activated
      otpSection.classList.add('hidden');
      level2Data.classList.remove('hidden');
      renderLevel2Data();

      // Show Level 3
      overrideSection.classList.add('hidden');
      level3Data.classList.remove('hidden');
      level3Data.classList.add('animate-in');

      renderLevel3Data();

      VEAP.showToast('🚨 Emergency Override activated — All data unlocked', 'error');
    });
  }

  function renderLevel3Data() {
    const fields = [
      { label: 'Full Name', value: userData.name },
      { label: 'Age', value: userData.age },
      { label: 'Blood Group', value: userData.bloodGroup },
      { label: 'Conditions', value: (userData.conditions || []).join(', ') },
      { label: 'Allergies', value: userData.allergies },
      { label: 'Medications', value: userData.medications },
      { label: 'Medical History', value: userData.medicalHistory },
      { label: 'Emergency Instructions', value: userData.emergencyInstructions },
    ];

    let html = '<div style="display:flex;flex-direction:column;gap:var(--space-md)">';

    fields.forEach(f => {
      if (f.value) {
        html += `
          <div>
            <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">${f.label}</div>
            <div style="font-weight:500;white-space:pre-wrap">${escapeHtml(f.value)}</div>
          </div>
        `;
      }
    });

    // Contacts
    if (userData.contacts && userData.contacts.length > 0) {
      html += `<div><div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Emergency Contacts</div>`;
      userData.contacts.forEach(c => {
        html += `<div style="margin-bottom:4px"><strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.relationship || 'Contact')}) — <a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></div>`;
      });
      html += `</div>`;
    }

    html += '</div>';
    fullProfileData.innerHTML = html;
  }

  // ---- Report Misuse ----
  function setupReport() {
    const openReport = () => reportModal.classList.add('active');
    const closeReport = () => reportModal.classList.remove('active');

    if (reportMisuseBtn) reportMisuseBtn.addEventListener('click', openReport);
    if (reportMisuseFromRate) reportMisuseFromRate.addEventListener('click', openReport);

    cancelReportBtn.addEventListener('click', closeReport);
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) closeReport();
    });

    confirmReportBtn.addEventListener('click', () => {
      closeReport();
      VEAP.showToast('✅ Misuse report submitted. Thank you.', 'success');
      if (userId) {
        VEAP.addScanEvent(userId, 'misuse_reported');
      }
    });
  }

  // ---- Reload ----
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // ---- Utility ----
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    Security.cleanup();
  });
});
