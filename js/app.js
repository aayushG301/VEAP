/* ==========================================
   VEAP – Shared Utilities
   ========================================== */

const VEAP = {
  // ---- Storage Keys ----
  STORAGE_KEY: 'veap_users',
  SCAN_LOG_KEY: 'veap_scan_logs',

  // ---- UUID Generation ----
  generateId() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  },

  // ---- LocalStorage Helpers ----
  getUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
    } catch { return {}; }
  },

  getUser(id) {
    const users = this.getUsers();
    return users[id] || null;
  },

  saveUser(id, data) {
    const users = this.getUsers();
    users[id] = { ...data, updatedAt: Date.now() };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
    return users[id];
  },

  deleteUser(id) {
    const users = this.getUsers();
    delete users[id];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  },

  getCurrentUserId() {
    return localStorage.getItem('veap_current_user');
  },

  setCurrentUserId(id) {
    localStorage.setItem('veap_current_user', id);
  },

  // ---- Scan Logs ----
  getScanLogs(userId) {
    try {
      const logs = JSON.parse(localStorage.getItem(this.SCAN_LOG_KEY)) || {};
      return logs[userId] || [];
    } catch { return []; }
  },

  addScanLog(userId) {
    try {
      const logs = JSON.parse(localStorage.getItem(this.SCAN_LOG_KEY)) || {};
      if (!logs[userId]) logs[userId] = [];
      logs[userId].unshift({
        time: Date.now(),
        userAgent: navigator.userAgent.substring(0, 100),
        action: 'scan'
      });
      // Keep last 50 logs
      logs[userId] = logs[userId].slice(0, 50);
      localStorage.setItem(this.SCAN_LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to log scan:', e);
    }
  },

  addScanEvent(userId, action) {
    try {
      const logs = JSON.parse(localStorage.getItem(this.SCAN_LOG_KEY)) || {};
      if (!logs[userId]) logs[userId] = [];
      logs[userId].unshift({
        time: Date.now(),
        userAgent: navigator.userAgent.substring(0, 100),
        action: action
      });
      logs[userId] = logs[userId].slice(0, 50);
      localStorage.setItem(this.SCAN_LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to log event:', e);
    }
  },

  // ---- Time Formatting ----
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  // ---- Toast Notifications ----
  showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) container.remove();
    }, 4000);
  },

  // ---- Offline Detection ----
  initOfflineDetection() {
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.id = 'offlineBanner';
    banner.textContent = '⚡ You are offline. Some features may not work.';
    document.body.appendChild(banner);

    const update = () => {
      banner.classList.toggle('visible', !navigator.onLine);
    };

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  },

  // ---- URL Helpers ----
  getBaseUrl() {
    const loc = window.location;

    // file:// — origin is the literal string "null", so build from href
    if (loc.protocol === 'file:') {
      // Strip query/hash, then drop the last path segment (filename)
      const clean = loc.href.split('?')[0].split('#')[0];
      const lastSlash = clean.lastIndexOf('/');
      return lastSlash !== -1 ? clean.substring(0, lastSlash + 1) : clean + '/';
    }

    // http(s):// — use pathname segments so subfolders are preserved
    const segments = loc.pathname.split('/').filter(Boolean);

    // Drop the last segment only if it looks like a file (contains a dot)
    if (segments.length > 0 && segments[segments.length - 1].includes('.')) {
      segments.pop();
    }

    // Rebuild: origin + /segments/ (always ends with a trailing slash)
    const dir = segments.length > 0 ? '/' + segments.join('/') + '/' : '/';
    return loc.origin + dir;
  },

  getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
};

// Initialize offline detection on every page
document.addEventListener('DOMContentLoaded', () => {
  VEAP.initOfflineDetection();
});
