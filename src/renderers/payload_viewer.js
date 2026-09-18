/**
 * AirQR — Mobile & Desktop Payload Renderer & UX Actions
 * High-craft DOM generation, safe sanitization, isolated ObjectURL management, and haptic feedback.
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
 * Formats byte values into human-readable strings with tabular spacing.
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
 * Triggers subtle haptic pulse on supported mobile browsers.
 */
export function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([30, 40, 30]);
    } catch {
      // Ignore if device disallows
    }
  }
}

/**
 * Renders an incoming payload onto the mobile receiver DOM.
 * Styled with tactile dark obsidian materials, clean typography, and high-contrast actions.
 * @param {Object} payload 
 * @param {HTMLElement} containerEl 
 * @param {HTMLElement} [actionEl] 
 */
export function renderMobilePayload(payload, containerEl, actionEl) {
  if (!containerEl || !payload) return;

  triggerHaptic();

  const card = document.createElement('div');
  card.className = 'bg-[#121215] border border-white/10 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col gap-3.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2';

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
  const urlString = (payload.text || payload.payload || '').trim();
  const safeHref = encodeURI(urlString);
  let domain = 'Web Link';
  try {
    domain = new URL(urlString).hostname;
  } catch {
    domain = 'Web Link';
  }

  const timeString = new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[11px] font-medium tracking-wide bg-blue-500/10 text-blue-400 border border-blue-500/20">Link</span>
        <span class="text-xs text-zinc-400 font-mono truncate max-w-[180px]">${escapeHtml(domain)}</span>
      </div>
      <span class="text-[11px] text-zinc-500 font-mono tabular-nums">${timeString}</span>
    </div>

    <div class="bg-[#0b0c0e] border border-white/[0.06] rounded-lg p-3">
      <p class="text-xs font-mono text-zinc-200 break-all leading-relaxed select-all">${escapeHtml(urlString)}</p>
    </div>

    <div class="grid grid-cols-2 gap-2 pt-1">
      <a 
        href="${safeHref}" 
        target="_blank" 
        rel="noopener noreferrer" 
        class="py-2.5 px-3 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
        <span>Open Link</span>
      </a>

      <button 
        type="button" 
        class="btn-copy-url py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700/60 flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy URL</span>
      </button>
    </div>
  `;

  const copyBtn = card.querySelector('.btn-copy-url');
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(urlString);
    triggerHaptic();
    const span = copyBtn.querySelector('span');
    if (span) {
      span.textContent = 'Copied!';
      setTimeout(() => { span.textContent = 'Copy URL'; }, 2000);
    }
  });
}

function renderTextSnippet(payload, card, actionEl) {
  const text = payload.text || payload.payload || '';
  const lines = text.split('\n').length;
  const chars = text.length;
  const timeString = new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[11px] font-medium tracking-wide bg-zinc-800 text-zinc-300 border border-zinc-700/60">Note</span>
        <span class="text-xs text-zinc-400 font-mono tabular-nums">${lines} line${lines === 1 ? '' : 's'} • ${chars} char${chars === 1 ? '' : 's'}</span>
      </div>
      <span class="text-[11px] text-zinc-500 font-mono tabular-nums">${timeString}</span>
    </div>

    <pre class="bg-[#0b0c0e] border border-white/[0.06] p-3.5 rounded-lg font-mono text-xs text-zinc-200 whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed select-text"></pre>

    <div class="pt-1">
      <button 
        type="button" 
        class="btn-copy-text w-full py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700/60 flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy to Clipboard</span>
      </button>
    </div>
  `;

  // Safely inject plain text
  const pre = card.querySelector('pre');
  if (pre) pre.textContent = text;

  const copyBtn = card.querySelector('.btn-copy-text');
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard.writeText(text);
    triggerHaptic();
    const span = copyBtn.querySelector('span');
    if (span) {
      span.textContent = 'Copied to Clipboard!';
      setTimeout(() => { span.textContent = 'Copy to Clipboard'; }, 2000);
    }
  });
}

function renderFilePayload(payload, card, actionEl) {
  const objectUrl = URL.createObjectURL(payload.blob);
  const isImage = payload.mime && payload.mime.startsWith('image/');
  const isPdf = payload.mime === 'application/pdf';
  const timeString = new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let previewHtml = '';
  if (isImage) {
    previewHtml = `
      <div class="relative rounded-lg overflow-hidden bg-[#0b0c0e] border border-white/[0.06] max-h-80 flex items-center justify-center p-1">
        <img src="${objectUrl}" alt="${escapeHtml(payload.name)}" class="w-full h-auto max-h-72 object-contain rounded" />
      </div>
    `;
  }

  card.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[11px] font-medium tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ${isImage ? 'Image' : isPdf ? 'PDF' : 'File'}
        </span>
        <span class="text-xs text-zinc-400 font-mono tabular-nums">${formatBytes(payload.size)}</span>
      </div>
      <span class="text-[11px] text-zinc-500 font-mono tabular-nums">${timeString}</span>
    </div>

    ${previewHtml}

    <div class="flex items-center gap-3 p-3 rounded-lg bg-[#0b0c0e] border border-white/[0.06]">
      <div class="w-9 h-9 rounded-md bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 flex-shrink-0">
        ${isPdf ? `
          <svg class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        ` : isImage ? `
          <svg class="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        ` : `
          <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        `}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-zinc-100 truncate">${escapeHtml(payload.name)}</p>
        <p class="text-[11px] text-zinc-500 font-mono truncate">${escapeHtml(payload.mime || 'application/octet-stream')}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 pt-1">
      <a 
        href="${objectUrl}" 
        download="${escapeHtml(payload.name)}" 
        class="btn-download-file col-span-1 py-2.5 px-3 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        <span>${isImage ? 'Save Photo' : 'Download'}</span>
      </a>

      <button 
        type="button" 
        class="btn-share-file col-span-1 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700/60 flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
      >
        <svg class="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
        <span>Share</span>
      </button>
    </div>
  `;

  const downloadLink = card.querySelector('.btn-download-file');
  downloadLink?.addEventListener('click', () => {
    triggerHaptic();
  });

  const shareBtn = card.querySelector('.btn-share-file');
  shareBtn?.addEventListener('click', async () => {
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
        downloadLink?.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        downloadLink?.click();
      }
    }
  });
}
