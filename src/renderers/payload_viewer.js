/**
 * AirQR — Mobile Payload Renderer & UX Actions
 * DOM generation, safe sanitization, isolated ObjectURL management, and haptic feedback.
 * Path: src/renderers/payload_viewer.js
 */

/**
 * Escapes characters to prevent XSS injection.
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Checks if a string is a valid HTTP/HTTPS URL.
 * @param {string} str 
 * @returns {boolean}
 */
export function isValidUrl(str) {
  try {
    const parsed = new URL(str.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Formats byte values into human-readable strings.
 * @param {number} bytes 
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Triggers haptic pulse on supported mobile browsers.
 * Pattern: [40ms pulse, 60ms pause, 40ms pulse]
 */
export function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([40, 60, 40]);
    } catch {
      // Ignored if device/browser disallows vibration
    }
  }
}

/**
 * Renders an incoming payload onto the mobile receiver DOM.
 * @param {Object} payload 
 * @param {HTMLElement} containerEl 
 * @param {HTMLElement} [actionEl] 
 */
export function renderMobilePayload(payload, containerEl, actionEl) {
  if (!containerEl || !payload) return;

  // Auto-trigger haptic vibration upon successful payload arrival
  triggerHaptic();

  const card = document.createElement('div');
  card.className = 'bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 transition-all duration-300 transform translate-y-0 opacity-100';

  if (payload.type === 'text') {
    if (payload.isUrl || isValidUrl(payload.text)) {
      renderUrlPayload(payload, card, actionEl);
    } else {
      renderTextSnippet(payload, card, actionEl);
    }
  } else if (payload.type === 'file') {
    renderFilePayload(payload, card, actionEl);
  }

  // Prepend to show most recent transmission first
  if (containerEl.firstChild) {
    containerEl.insertBefore(card, containerEl.firstChild);
  } else {
    containerEl.appendChild(card);
  }
}

function renderUrlPayload(payload, card, actionEl) {
  const urlString = payload.text || payload.payload;
  const safeHref = encodeURI(urlString.trim());
  let domain = '';
  try {
    domain = new URL(urlString).hostname;
  } catch {
    domain = 'Web Link';
  }

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Link</span>
        <span class="text-xs text-slate-400 font-mono">${escapeHtml(domain)}</span>
      </div>
      <button class="btn-copy-url px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg border border-slate-700/50 flex items-center gap-1 transition-colors">
        <svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy</span>
      </button>
    </div>

    <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5">
      <p class="text-xs font-mono text-cyan-300 break-all">${escapeHtml(urlString)}</p>
    </div>

    <a 
      href="${safeHref}" 
      target="_blank" 
      rel="noopener noreferrer" 
      class="w-full py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
      <span>Open Link</span>
    </a>
  `;

  const copyBtn = card.querySelector('.btn-copy-url');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(urlString);
    triggerHaptic();
    copyBtn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.querySelector('span').textContent = 'Copy';
    }, 2000);
  });
}

function renderTextSnippet(payload, card, actionEl) {
  const text = payload.text || payload.payload;
  const lineCount = (text.match(/\n/g) || []).length + 1;
  const charCount = text.length;

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Text</span>
        <span class="text-xs text-slate-400 font-mono">${lineCount} lines • ${charCount} chars</span>
      </div>
      <button class="btn-copy-text px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg border border-slate-700/50 flex items-center gap-1 transition-colors">
        <svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy</span>
      </button>
    </div>

    <pre class="bg-slate-950 border border-slate-800/80 p-4 rounded-xl font-mono text-xs text-slate-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed select-text"></pre>
  `;

  // Safely inject via textContent to fully eliminate XSS
  card.querySelector('pre').textContent = text;

  const copyBtn = card.querySelector('.btn-copy-text');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(text);
    triggerHaptic();
    copyBtn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.querySelector('span').textContent = 'Copy';
    }, 2000);
  });
}

function renderFilePayload(payload, card, actionEl) {
  const objectUrl = URL.createObjectURL(payload.blob);
  const isImage = payload.mime && payload.mime.startsWith('image/');
  const isPdf = payload.mime === 'application/pdf';

  let previewHtml = '';
  if (isImage) {
    previewHtml = `
      <div class="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 max-h-80 flex items-center justify-center p-1">
        <img src="${objectUrl}" alt="${escapeHtml(payload.name)}" class="w-full h-auto max-h-72 object-contain rounded-lg" />
      </div>
    `;
  } else if (isPdf) {
    previewHtml = `
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-6 h-6 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="text-xs text-slate-300 font-mono">PDF Document</span>
        </div>
        <a href="${objectUrl}" target="_blank" rel="noopener noreferrer" class="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">View Inline</a>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ${isImage ? 'Image' : isPdf ? 'PDF' : 'File'}
        </span>
        <span class="text-xs text-slate-400 font-mono">${formatBytes(payload.size)}</span>
      </div>
      <span class="text-xs text-slate-500 font-mono">${new Date(payload.timestamp || Date.now()).toLocaleTimeString()}</span>
    </div>

    ${previewHtml}

    <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800/80">
      <div class="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-slate-200 truncate">${escapeHtml(payload.name)}</p>
        <p class="text-[11px] text-slate-500 font-mono">${escapeHtml(payload.mime || 'application/octet-stream')}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <a 
        href="${objectUrl}" 
        download="${escapeHtml(payload.name)}" 
        class="btn-download-file col-span-1 py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        <span>${isImage ? 'Save Image' : 'Save File'}</span>
      </a>

      <button 
        type="button" 
        class="btn-share-file col-span-1 py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700/80 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
      >
        <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
        <span>Share</span>
      </button>
    </div>
  `;

  // Download trigger
  const downloadLink = card.querySelector('.btn-download-file');
  downloadLink.addEventListener('click', () => {
    triggerHaptic();
  });

  // Web Share API trigger
  const shareBtn = card.querySelector('.btn-share-file');
  shareBtn.addEventListener('click', async () => {
    try {
      const fileObj = new File([payload.blob], payload.name, { type: payload.mime });
      if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
        await navigator.share({
          title: payload.name,
          files: [fileObj]
        });
        triggerHaptic();
      } else if (navigator.share) {
        await navigator.share({
          title: payload.name,
          url: objectUrl
        });
        triggerHaptic();
      } else {
        // Fallback: trigger click on download anchor
        downloadLink.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        downloadLink.click();
      }
    }
  });
}
