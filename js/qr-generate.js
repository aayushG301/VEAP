/* ==========================================
   VEAP – QR Code Generation
   Uses qrcode-generator library (loaded via CDN)
   ========================================== */

const QRGen = {
  /**
   * Generate and render a QR code into a target element
   * @param {string} data - The URL/data to encode
   * @param {HTMLElement} container - The container element
   * @param {number} size - Cell size (default 6)
   */
  render(data, container, size = 6) {
    if (!container) return;

    // Clear previous
    container.innerHTML = '';

    if (typeof qrcode === 'undefined') {
      container.innerHTML = '<p style="color:var(--emergency-red)">QR library not loaded</p>';
      return;
    }

    try {
      const qr = qrcode(0, 'M');
      qr.addData(data);
      qr.make();

      // Create image from QR
      const img = document.createElement('img');
      img.src = qr.createDataURL(size, 0);
      img.alt = 'VEAP Emergency QR Code';
      img.style.width = '200px';
      img.style.height = '200px';
      img.style.imageRendering = 'pixelated';

      container.appendChild(img);
    } catch (e) {
      console.error('QR generation failed:', e);
      container.innerHTML = '<p style="color:var(--emergency-red)">Failed to generate QR code</p>';
    }
  },

  /**
   * Build the emergency URL for a given user ID
   * @param {string} userId
   * @returns {string}
   */
  buildUrl(userId) {
    const base = VEAP.getBaseUrl();
    return `${base}emergency.html?id=${userId}`;
  },

  /**
   * Download QR as image
   * @param {HTMLElement} container - The container with the QR image
   * @param {string} filename
   */
  download(container, filename = 'veap-qr-code.png') {
    const img = container.querySelector('img');
    if (!img) return;

    const link = document.createElement('a');
    link.download = filename;
    link.href = img.src;
    link.click();
  }
};
