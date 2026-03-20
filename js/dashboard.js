/* ==========================================
   VEAP – Dashboard Logic
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('profileForm');
  const conditionInput = document.getElementById('conditionInput');
  const addConditionBtn = document.getElementById('addConditionBtn');
  const conditionsTags = document.getElementById('conditionsTags');
  const contactsContainer = document.getElementById('contactsContainer');
  const addContactBtn = document.getElementById('addContactBtn');
  const qrSection = document.getElementById('qrSection');
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const qrUrl = document.getElementById('qrUrl');
  const downloadQrBtn = document.getElementById('downloadQrBtn');
  const testQrBtn = document.getElementById('testQrBtn');
  const scanLogSection = document.getElementById('scanLogSection');
  const scanLogList = document.getElementById('scanLogList');
  const dangerZone = document.getElementById('dangerZone');
  const deleteProfileBtn = document.getElementById('deleteProfileBtn');
  const deleteModal = document.getElementById('deleteModal');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  let conditions = [];
  let contacts = [];
  let currentUserId = VEAP.getCurrentUserId();

  // ---- Initialize ----
  init();

  function init() {
    if (currentUserId) {
      const user = VEAP.getUser(currentUserId);
      if (user) {
        loadUserData(user);
        generateQR();
        showScanLogs();
        dangerZone.classList.remove('hidden');
      } else {
        currentUserId = null;
        localStorage.removeItem('veap_current_user');
      }
    }

    // Add one empty contact by default
    if (contacts.length === 0) {
      addContact();
    }

    renderConditions();
  }

  // ---- Conditions (Tag Input) ----
  addConditionBtn.addEventListener('click', () => {
    addCondition();
  });

  conditionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCondition();
    }
  });

  function addCondition() {
    const val = conditionInput.value.trim();
    if (val && !conditions.includes(val)) {
      conditions.push(val);
      conditionInput.value = '';
      renderConditions();
    }
  }

  function removeCondition(index) {
    conditions.splice(index, 1);
    renderConditions();
  }

  function renderConditions() {
    conditionsTags.innerHTML = conditions.map((c, i) => `
      <span class="tag">
        ${escapeHtml(c)}
        <button type="button" class="tag__remove" data-index="${i}" aria-label="Remove ${escapeHtml(c)}">✕</button>
      </span>
    `).join('');

    conditionsTags.querySelectorAll('.tag__remove').forEach(btn => {
      btn.addEventListener('click', () => removeCondition(parseInt(btn.dataset.index)));
    });
  }

  // ---- Emergency Contacts ----
  addContactBtn.addEventListener('click', () => {
    if (contacts.length < 3) {
      addContact();
    } else {
      VEAP.showToast('Maximum 3 emergency contacts allowed', 'warning');
    }
  });

  function addContact(data = { name: '', phone: '', relationship: '' }) {
    const index = contacts.length;
    contacts.push(data);
    renderContacts();
  }

  function removeContact(index) {
    contacts.splice(index, 1);
    renderContacts();
  }

  function renderContacts() {
    contactsContainer.innerHTML = contacts.map((c, i) => `
      <div class="card" style="padding:var(--space-md);margin-bottom:var(--space-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)">
          <span class="text-sm" style="font-weight:600;color:var(--text-muted)">Contact ${i + 1}</span>
          ${contacts.length > 1 ? `<button type="button" class="btn btn--ghost btn--sm remove-contact-btn" data-index="${i}" style="padding:4px 8px;min-height:auto;color:var(--emergency-red)">✕</button>` : ''}
        </div>
        <div class="form-group" style="margin-bottom:var(--space-sm)">
          <input type="text" class="form-input contact-name" data-index="${i}" placeholder="Contact name" value="${escapeHtml(c.name)}">
        </div>
        <div class="form-group" style="margin-bottom:var(--space-sm)">
          <input type="tel" class="form-input contact-phone" data-index="${i}" placeholder="Phone number" value="${escapeHtml(c.phone)}">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <input type="text" class="form-input contact-rel" data-index="${i}" placeholder="Relationship (e.g. Mother, Spouse)" value="${escapeHtml(c.relationship || '')}">
        </div>
      </div>
    `).join('');

    // Bind remove buttons
    contactsContainer.querySelectorAll('.remove-contact-btn').forEach(btn => {
      btn.addEventListener('click', () => removeContact(parseInt(btn.dataset.index)));
    });

    // Bind input changes
    contactsContainer.querySelectorAll('.contact-name').forEach(input => {
      input.addEventListener('input', () => { contacts[parseInt(input.dataset.index)].name = input.value; });
    });
    contactsContainer.querySelectorAll('.contact-phone').forEach(input => {
      input.addEventListener('input', () => { contacts[parseInt(input.dataset.index)].phone = input.value; });
    });
    contactsContainer.querySelectorAll('.contact-rel').forEach(input => {
      input.addEventListener('input', () => { contacts[parseInt(input.dataset.index)].relationship = input.value; });
    });
  }

  // ---- Form Submit ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });

  function saveProfile() {
    // Read contacts from current DOM (in case they changed)
    const contactNames = document.querySelectorAll('.contact-name');
    const contactPhones = document.querySelectorAll('.contact-phone');
    const contactRels = document.querySelectorAll('.contact-rel');

    contacts = [];
    contactNames.forEach((el, i) => {
      contacts.push({
        name: el.value.trim(),
        phone: contactPhones[i]?.value.trim() || '',
        relationship: contactRels[i]?.value.trim() || ''
      });
    });

    // Filter out empty contacts
    const validContacts = contacts.filter(c => c.name && c.phone);

    const userData = {
      name: document.getElementById('name').value.trim(),
      age: document.getElementById('age').value,
      bloodGroup: document.getElementById('bloodGroup').value,
      conditions: [...conditions],
      allergies: document.getElementById('allergies').value.trim(),
      medications: document.getElementById('medications').value.trim(),
      medicalHistory: document.getElementById('medicalHistory').value.trim(),
      emergencyInstructions: document.getElementById('emergencyInstructions').value.trim(),
      contacts: validContacts,
      createdAt: currentUserId ? (VEAP.getUser(currentUserId)?.createdAt || Date.now()) : Date.now()
    };

    // Validate
    if (!userData.name) {
      VEAP.showToast('Please enter your name', 'error');
      return;
    }
    if (!userData.bloodGroup) {
      VEAP.showToast('Please select your blood group', 'error');
      return;
    }

    // Save
    if (!currentUserId) {
      currentUserId = VEAP.generateId();
    }

    VEAP.saveUser(currentUserId, userData);
    VEAP.setCurrentUserId(currentUserId);

    generateQR();
    showScanLogs();
    dangerZone.classList.remove('hidden');

    VEAP.showToast('Profile saved successfully!', 'success');
  }

  // ---- QR Generation ----
  function generateQR() {
    if (!currentUserId) return;

    const url = QRGen.buildUrl(currentUserId);
    QRGen.render(url, qrCodeContainer);
    qrUrl.textContent = url;
    qrSection.classList.remove('hidden');

    // Scroll to QR
    setTimeout(() => {
      qrSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  downloadQrBtn.addEventListener('click', () => {
    QRGen.download(qrCodeContainer, `veap-qr-${currentUserId}.png`);
    VEAP.showToast('QR code downloaded!', 'success');
  });

  testQrBtn.addEventListener('click', () => {
    if (currentUserId) {
      window.open(QRGen.buildUrl(currentUserId), '_blank');
    }
  });

  // ---- Scan Logs ----
  function showScanLogs() {
    if (!currentUserId) return;

    const logs = VEAP.getScanLogs(currentUserId);
    scanLogSection.classList.remove('hidden');

    if (logs.length === 0) {
      scanLogList.innerHTML = '<p class="text-sm text-muted text-center">No scans recorded yet</p>';
      return;
    }

    scanLogList.innerHTML = logs.slice(0, 10).map(log => {
      const actionLabels = {
        'scan': '📱 QR Scanned',
        'otp_verified': '🔓 OTP Verified (Level 2)',
        'emergency_override': '🚨 Emergency Override (Level 3)',
        'otp_failed': '❌ OTP Failed'
      };
      return `
        <div class="scan-log__item">
          <span class="scan-log__dot"></span>
          <span>${actionLabels[log.action] || '📱 Scanned'}</span>
          <span class="scan-log__time">${VEAP.formatTime(log.time)}</span>
        </div>
      `;
    }).join('');
  }

  // Refresh scan logs every 5 seconds
  setInterval(() => {
    if (currentUserId && !scanLogSection.classList.contains('hidden')) {
      showScanLogs();
    }
  }, 5000);

  // ---- Load Existing Data ----
  function loadUserData(user) {
    document.getElementById('name').value = user.name || '';
    document.getElementById('age').value = user.age || '';
    document.getElementById('bloodGroup').value = user.bloodGroup || '';
    document.getElementById('allergies').value = user.allergies || '';
    document.getElementById('medications').value = user.medications || '';
    document.getElementById('medicalHistory').value = user.medicalHistory || '';
    document.getElementById('emergencyInstructions').value = user.emergencyInstructions || '';

    conditions = user.conditions || [];
    contacts = user.contacts && user.contacts.length > 0 ? [...user.contacts] : [];
    if (contacts.length === 0) contacts.push({ name: '', phone: '', relationship: '' });

    renderConditions();
    renderContacts();
  }

  // ---- Delete Profile ----
  deleteProfileBtn.addEventListener('click', () => {
    deleteModal.classList.add('active');
  });

  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.remove('active');
  });

  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) deleteModal.classList.remove('active');
  });

  confirmDeleteBtn.addEventListener('click', () => {
    if (currentUserId) {
      VEAP.deleteUser(currentUserId);
      localStorage.removeItem('veap_current_user');

      // Clear scan logs for this user
      try {
        const logs = JSON.parse(localStorage.getItem(VEAP.SCAN_LOG_KEY)) || {};
        delete logs[currentUserId];
        localStorage.setItem(VEAP.SCAN_LOG_KEY, JSON.stringify(logs));
      } catch (e) {}

      currentUserId = null;
      conditions = [];
      contacts = [{ name: '', phone: '', relationship: '' }];

      form.reset();
      renderConditions();
      renderContacts();
      qrSection.classList.add('hidden');
      scanLogSection.classList.add('hidden');
      dangerZone.classList.add('hidden');
      deleteModal.classList.remove('active');

      VEAP.showToast('Profile deleted successfully', 'info');
    }
  });

  // ---- Utility ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
