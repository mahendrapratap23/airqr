/**
 * AirQR — Ultra-fast, Minimalist, Screen-to-Mobile WebRTC Bridge
 * Zero-install, Zero-server-storage, Pure In-Memory P2P DataChannel.
 *
 * Strict Architecture:
 * - Module 1: SessionRouter (Hash inspection, mode mounting)
 * - Module 2: PeerTransport (PeerJS encapsulation, STUN, typed error state machine)
 * - Module 3: PayloadStreamer (16KB chunking, SCTP flow control, staged sync)
 * - Module 4: PayloadRenderer (Blob assembly, isolated ObjectURL, XSS sanitization)
 */

// ==========================================
// CONFIGURATION & SOUND CUES
// ==========================================
const CONFIG = {
  CHUNK_SIZE: 16 * 1024, // 16KB optimal chunk size for WebRTC SCTP
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB safety limit
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  ROOM_PREFIX: 'airqr-'
};

// Subtle Web Audio Synthesizer for tactile feedback
class SoundCueEngine {
  constructor() {
    this.audioCtx = null;
  }

  _initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playConnect() {
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, this.audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, this.audioCtx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.25);
    } catch (err) {
      console.warn('Audio feedback blocked by browser policy:', err.message);
    }
  }

  playComplete() {
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, this.audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.35);
    } catch (err) {
      console.warn('Audio feedback blocked by browser policy:', err.message);
    }
  }
}

const sound = new SoundCueEngine();

// ==========================================
// UTILITY & SANITIZATION ENGINE
// ==========================================
class Utils {
  static escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  static isValidHttpUrl(string) {
    let url;
    try {
      url = new URL(string.trim());
    } catch (e) {
      return false;
    }
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  static generateRoomId() {
    const randomHex = Math.random().toString(36).substring(2, 8);
    const timeHex = Date.now().toString(36).slice(-4);
    return `${CONFIG.ROOM_PREFIX}${randomHex}${timeHex}`;
  }

  static showToast(message, type = 'info', durationMs = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success' 
      ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' 
      : type === 'error'
      ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
      : 'bg-slate-900/90 border-slate-700 text-slate-200';

    toast.className = `px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium flex items-center gap-2 transform translate-y-2 opacity-0 transition-all duration-200 pointer-events-auto ${bgClass}`;
    
    const icon = type === 'success' 
      ? '<svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'
      : type === 'error'
      ? '<svg class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>'
      : '<svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

    toast.innerHTML = `${icon}<span>${Utils.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }
}

// ==========================================
// MODULE 2: PEER TRANSPORT (WebRTC & PeerJS)
// ==========================================
class PeerTransport {
  constructor() {
    this.peer = null;
    this.activeConnection = null;
    this.currentRoomId = null;
    this.isSender = false;
    this.state = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | CONNECTED | TRANSFERRING | ERROR
    this.subscribers = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  onStateChange(cb) {
    this.subscribers.add(cb);
  }

  _setState(newState, meta = {}) {
    this.state = newState;
    this.subscribers.forEach(cb => cb(this.state, meta));
  }

  initAsSender(roomId) {
    this.isSender = true;
    this.currentRoomId = roomId;
    this._teardown();
    this._setState('CONNECTING', { role: 'sender', roomId });

    try {
      this.peer = new window.Peer(roomId, {
        debug: 1,
        config: {
          iceServers: CONFIG.ICE_SERVERS
        }
      });

      this.peer.on('open', (id) => {
        this.currentRoomId = id;
        this.reconnectAttempts = 0;
        this._setState('DISCONNECTED', { role: 'sender', roomId: id, readyToPair: true });
      });

      this.peer.on('connection', (conn) => {
        this._handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        this._handlePeerError(err);
      });

      this.peer.on('disconnected', () => {
        this._setState('DISCONNECTED', { message: 'Peer server disconnected. Attempting automatic recovery...' });
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    } catch (err) {
      this._setState('ERROR', { error: `Failed to initialize WebRTC engine: ${err.message}` });
    }
  }

  connectAsReceiver(targetRoomId) {
    this.isSender = false;
    this.currentRoomId = targetRoomId;
    this._teardown();
    this._setState('CONNECTING', { role: 'receiver', targetRoomId });

    try {
      // Receiver connects using an ephemeral ID
      this.peer = new window.Peer({
        debug: 1,
        config: {
          iceServers: CONFIG.ICE_SERVERS
        }
      });

      this.peer.on('open', () => {
        this.reconnectAttempts = 0;
        this._dialSender(targetRoomId);
      });

      this.peer.on('error', (err) => {
        this._handlePeerError(err);
      });

      this.peer.on('disconnected', () => {
        this._setState('DISCONNECTED', { message: 'Signaling lost. Reconnecting...' });
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    } catch (err) {
      this._setState('ERROR', { error: `WebRTC Initialization failed: ${err.message}` });
    }
  }

  _dialSender(targetRoomId) {
    if (!this.peer || this.peer.destroyed) return;

    this._setState('CONNECTING', { message: 'Performing ICE Handshake...' });
    const conn = this.peer.connect(targetRoomId, {
      reliable: true,
      serialization: 'binary'
    });

    this._bindDataConnection(conn);
  }

  _handleIncomingConnection(conn) {
    // If another peer was active, clean up previous
    if (this.activeConnection) {
      this.activeConnection.close();
    }
    this._bindDataConnection(conn);
  }

  _bindDataConnection(conn) {
    this.activeConnection = conn;

    conn.on('open', () => {
      sound.playConnect();
      this._setState('CONNECTED', { 
        peerId: conn.peer, 
        role: this.isSender ? 'sender' : 'receiver' 
      });

      // Crucial: Auto-trigger immediate state sync if payload was staged before mobile scanned
      if (this.isSender && window.payloadStreamer && window.payloadStreamer.hasStagedPayload()) {
        window.payloadStreamer.dispatchStagedPayload();
      }
    });

    conn.on('data', (data) => {
      if (window.payloadRenderer) {
        window.payloadRenderer.handleIncomingData(data);
      }
    });

    conn.on('close', () => {
      this._setState('DISCONNECTED', { message: 'Peer connection closed' });
      this.activeConnection = null;
    });

    conn.on('error', (err) => {
      this._setState('ERROR', { error: `DataChannel Error: ${err.message || 'Stream disrupted'}` });
    });
  }

  _handlePeerError(err) {
    let userMsg = err.message || 'Unknown WebRTC error';

    if (err.type === 'peer-unavailable') {
      userMsg = 'Desktop room not found. Ensure the desktop session is open.';
    } else if (err.type === 'unavailable-id') {
      userMsg = 'Room ID occupied. Generating fresh session...';
      if (this.isSender) {
        const nextId = Utils.generateRoomId();
        this.initAsSender(nextId);
        return;
      }
    } else if (err.type === 'network' || err.type === 'server-error') {
      userMsg = 'STUN signaling unreachable. Check internet connection.';
    }

    this._setState('ERROR', { error: userMsg, errorType: err.type });
  }

  _teardown() {
    if (this.activeConnection) {
      this.activeConnection.close();
      this.activeConnection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  send(data) {
    if (!this.activeConnection || !this.activeConnection.open) {
      throw new Error('WebRTC DataChannel is not open');
    }
    this.activeConnection.send(data);
  }

  getChannel() {
    return this.activeConnection ? this.activeConnection.dataChannel : null;
  }
}

// ==========================================
// MODULE 3: PAYLOAD STREAMER (Sender Engine)
// ==========================================
class PayloadStreamer {
  constructor(transport) {
    this.transport = transport;
    this.stagedPayload = null; // { type: 'text'|'file', payload: any }
    this.isStreaming = false;
  }

  stageText(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      this.stagedPayload = null;
      return;
    }
    this.stagedPayload = {
      type: 'text',
      data: trimmed,
      isUrl: Utils.isValidHttpUrl(trimmed),
      timestamp: Date.now()
    };
  }

  stageFile(file) {
    if (!file) {
      this.stagedPayload = null;
      return;
    }
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File exceeds maximum permitted size of ${Utils.formatBytes(CONFIG.MAX_FILE_SIZE_BYTES)}`);
    }
    this.stagedPayload = {
      type: 'file',
      file: file,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      timestamp: Date.now()
    };
  }

  clearStaged() {
    this.stagedPayload = null;
  }

  hasStagedPayload() {
    return this.stagedPayload !== null;
  }

  dispatchStagedPayload() {
    if (!this.stagedPayload) return;
    if (this.stagedPayload.type === 'text') {
      this.sendText(this.stagedPayload.data);
    } else if (this.stagedPayload.type === 'file') {
      this.sendFile(this.stagedPayload.file);
    }
  }

  sendText(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const payload = {
      type: 'text',
      payload: trimmed,
      isUrl: Utils.isValidHttpUrl(trimmed),
      timestamp: Date.now()
    };

    try {
      this.transport.send(payload);
      sound.playComplete();
      Utils.showToast('Text transmitted to mobile device', 'success');
    } catch (err) {
      Utils.showToast(`Transmission failed: ${err.message}`, 'error');
    }
  }

  async sendFile(file, onProgress) {
    if (!file) return;
    if (this.isStreaming) {
      Utils.showToast('A file transfer is already in progress', 'error');
      return;
    }

    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      Utils.showToast(`File size exceeds 50MB limit (${Utils.formatBytes(file.size)})`, 'error');
      return;
    }

    this.isStreaming = true;
    const fileId = 'file_' + Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(file.size / CONFIG.CHUNK_SIZE);
    const startTime = Date.now();

    // 1. Dispatch Metadata Header
    try {
      this.transport.send({
        type: 'file-meta',
        fileId: fileId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        totalChunks: totalChunks,
        chunkSize: CONFIG.CHUNK_SIZE,
        timestamp: startTime
      });
    } catch (err) {
      this.isStreaming = false;
      Utils.showToast(`Failed to initiate file header: ${err.message}`, 'error');
      return;
    }

    // 2. Stream 16KB ArrayBuffer Chunks with Backpressure Flow Control
    try {
      for (let i = 0; i < totalChunks; i++) {
        // Enforce WebRTC SCTP buffer flow control
        await this._waitForBufferDrained();

        const start = i * CONFIG.CHUNK_SIZE;
        const end = Math.min(start + CONFIG.CHUNK_SIZE, file.size);
        const sliceBlob = file.slice(start, end);
        const chunkBuffer = await sliceBlob.arrayBuffer();

        this.transport.send({
          type: 'file-chunk',
          fileId: fileId,
          index: i,
          data: chunkBuffer
        });

        // Compute transfer statistics
        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.001);
        const speedBytesPerSec = end / elapsedSec;
        const percent = Math.round((end / file.size) * 100);

        if (onProgress) {
          onProgress({
            fileId,
            name: file.name,
            sentBytes: end,
            totalBytes: file.size,
            percent,
            speed: Utils.formatBytes(speedBytesPerSec) + '/s',
            currentChunk: i + 1,
            totalChunks
          });
        }
      }

      // 3. Dispatch End-of-Transmission Marker
      this.transport.send({
        type: 'file-end',
        fileId: fileId,
        timestamp: Date.now()
      });

      sound.playComplete();
      Utils.showToast(`Transfer complete: ${file.name}`, 'success');
    } catch (err) {
      Utils.showToast(`Transfer interrupted: ${err.message}`, 'error');
    } finally {
      this.isStreaming = false;
    }
  }

  // Prevents UI-thread lockups and SCTP DataChannel buffer congestion
  async _waitForBufferDrained() {
    const dc = this.transport.getChannel();
    if (!dc) return;

    // 64KB High-water mark
    if (dc.bufferedAmount > 64 * 1024) {
      await new Promise((resolve) => {
        let timer;
        const onLow = () => {
          clearTimeout(timer);
          dc.removeEventListener('bufferedamountlow', onLow);
          resolve();
        };

        dc.bufferedAmountLowThreshold = 32 * 1024;
        dc.addEventListener('bufferedamountlow', onLow);

        // Fallback watchdog timeout to prevent indefinite lockup
        timer = setTimeout(() => {
          dc.removeEventListener('bufferedamountlow', onLow);
          resolve();
        }, 100);
      });
    }
  }
}

// ==========================================
// MODULE 4: PAYLOAD RENDERER (Receiver Engine)
// ==========================================
class PayloadRenderer {
  constructor() {
    this.transfers = new Map(); // fileId -> transfer tracker
    this.createdObjectUrls = []; // Track to prevent memory leaks
  }

  handleIncomingData(data) {
    if (!data || !data.type) return;

    if (data.type === 'text') {
      this._renderTextPayload(data);
    } else if (data.type === 'file-meta') {
      this._handleFileMeta(data);
    } else if (data.type === 'file-chunk') {
      this._handleFileChunk(data);
    } else if (data.type === 'file-end') {
      this._handleFileEnd(data);
    }
  }

  _renderTextPayload(data) {
    sound.playComplete();
    const waitingBox = document.getElementById('receiver-waiting-box');
    const payloadBox = document.getElementById('receiver-payload-box');

    if (waitingBox) waitingBox.classList.add('hidden');
    if (payloadBox) payloadBox.classList.remove('hidden');

    const card = document.createElement('div');
    card.className = 'bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300';

    if (data.isUrl) {
      // Safe URL card with XSS-safe attribute insertion
      const safeUrl = encodeURI(data.payload);
      card.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Web Link</span>
            <span class="text-xs text-slate-400">${new Date(data.timestamp || Date.now()).toLocaleTimeString()}</span>
          </div>
          <button class="btn-copy-dynamic text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy</span>
          </button>
        </div>

        <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
          <p class="text-xs font-mono text-cyan-300 break-all">${Utils.escapeHtml(data.payload)}</p>
        </div>

        <a 
          href="${safeUrl}" 
          target="_blank" 
          rel="noopener noreferrer" 
          class="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
          <span>Open Link in New Tab</span>
        </a>
      `;

      // Copy listener
      const copyBtn = card.querySelector('.btn-copy-dynamic');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.payload);
        Utils.showToast('Link copied to clipboard', 'success');
      });

    } else {
      // Formatted text card with strict entity protection
      const lineCount = (data.payload.match(/\n/g) || []).length + 1;
      const charCount = data.payload.length;

      card.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Text Snippet</span>
            <span class="text-xs text-slate-400">${lineCount} lines • ${charCount} chars</span>
          </div>
          <button class="btn-copy-dynamic text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy</span>
          </button>
        </div>

        <pre class="bg-slate-900 border border-slate-800 p-3.5 rounded-xl font-mono text-xs text-slate-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed select-text"></pre>
      `;

      // Safe injection into PRE text node to completely eliminate XSS
      card.querySelector('pre').textContent = data.payload;

      const copyBtn = card.querySelector('.btn-copy-dynamic');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.payload);
        Utils.showToast('Text copied to clipboard', 'success');
      });
    }

    // Prepend to top of receiver list
    if (payloadBox.firstChild) {
      payloadBox.insertBefore(card, payloadBox.firstChild);
    } else {
      payloadBox.appendChild(card);
    }
  }

  _handleFileMeta(meta) {
    this.transfers.set(meta.fileId, {
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      totalChunks: meta.totalChunks,
      chunks: new Array(meta.totalChunks),
      receivedBytes: 0,
      receivedChunks: 0,
      startTime: Date.now()
    });

    const progressBox = document.getElementById('receiver-progress-box');
    const waitingBox = document.getElementById('receiver-waiting-box');
    if (waitingBox) waitingBox.classList.add('hidden');
    if (progressBox) progressBox.classList.remove('hidden');

    const fileNameEl = document.getElementById('rx-file-name');
    if (fileNameEl) fileNameEl.textContent = meta.name;
  }

  _handleFileChunk(chunk) {
    const transfer = this.transfers.get(chunk.fileId);
    if (!transfer) return;

    transfer.chunks[chunk.index] = chunk.data;
    transfer.receivedBytes += chunk.data.byteLength;
    transfer.receivedChunks++;

    const percent = Math.round((transfer.receivedBytes / transfer.size) * 100);
    const elapsedSec = Math.max((Date.now() - transfer.startTime) / 1000, 0.001);
    const speed = Utils.formatBytes(transfer.receivedBytes / elapsedSec) + '/s';

    const barEl = document.getElementById('rx-progress-bar');
    const speedEl = document.getElementById('rx-speed-stat');
    const bytesEl = document.getElementById('rx-bytes-stat');

    if (barEl) barEl.style.width = `${percent}%`;
    if (speedEl) speedEl.textContent = `${speed} • ${percent}%`;
    if (bytesEl) bytesEl.textContent = `${Utils.formatBytes(transfer.receivedBytes)} / ${Utils.formatBytes(transfer.size)}`;
  }

  _handleFileEnd(endMsg) {
    const transfer = this.transfers.get(endMsg.fileId);
    if (!transfer) return;

    sound.playComplete();

    // Reconstruct into native binary Blob
    const blob = new Blob(transfer.chunks, { type: transfer.mime });
    const objectUrl = URL.createObjectURL(blob);
    this.createdObjectUrls.push(objectUrl);

    // Hide progress box
    const progressBox = document.getElementById('receiver-progress-box');
    if (progressBox) progressBox.classList.add('hidden');

    // Display Payload Card
    this._renderBinaryPayload({
      name: transfer.name,
      size: transfer.size,
      mime: transfer.mime,
      blob: blob,
      url: objectUrl
    });

    this.transfers.delete(endMsg.fileId);
  }

  _renderBinaryPayload(fileInfo) {
    const payloadBox = document.getElementById('receiver-payload-box');
    if (!payloadBox) return;
    payloadBox.classList.remove('hidden');

    const card = document.createElement('div');
    card.className = 'bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300';

    const isImage = fileInfo.mime.startsWith('image/');
    const isPdf = fileInfo.mime === 'application/pdf';

    let previewHtml = '';
    if (isImage) {
      previewHtml = `
        <div class="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 max-h-80 flex items-center justify-center">
          <img src="${fileInfo.url}" alt="${Utils.escapeHtml(fileInfo.name)}" class="w-full h-auto max-h-80 object-contain rounded-xl" />
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ${isImage ? 'Image File' : isPdf ? 'PDF Document' : 'Binary File'}
          </span>
          <span class="text-xs text-slate-400 font-mono">${Utils.formatBytes(fileInfo.size)}</span>
        </div>
        <span class="text-xs text-slate-500">${new Date().toLocaleTimeString()}</span>
      </div>

      ${previewHtml}

      <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div class="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-slate-200 truncate">${Utils.escapeHtml(fileInfo.name)}</p>
          <p class="text-[11px] text-slate-500 font-mono">${fileInfo.mime || 'application/octet-stream'}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-1">
        <a 
          href="${fileInfo.url}" 
          download="${Utils.escapeHtml(fileInfo.name)}" 
          class="col-span-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          <span>Save to Device</span>
        </a>

        <button 
          class="btn-share-mobile col-span-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
        >
          <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
          <span>Share</span>
        </button>
      </div>
    `;

    // Hook up native Web Share API on mobile
    const shareBtn = card.querySelector('.btn-share-mobile');
    shareBtn.addEventListener('click', async () => {
      try {
        const fileObj = new File([fileInfo.blob], fileInfo.name, { type: fileInfo.mime });
        if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            title: fileInfo.name,
            files: [fileObj]
          });
        } else if (navigator.share) {
          await navigator.share({
            title: fileInfo.name,
            url: fileInfo.url
          });
        } else {
          Utils.showToast('Web Share not supported in this browser; use Save button', 'info');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          Utils.showToast('Could not trigger share dialog', 'error');
        }
      }
    });

    if (payloadBox.firstChild) {
      payloadBox.insertBefore(card, payloadBox.firstChild);
    } else {
      payloadBox.appendChild(card);
    }
  }

  cleanup() {
    this.createdObjectUrls.forEach(url => URL.revokeObjectURL(url));
    this.createdObjectUrls = [];
  }
}

// ==========================================
// MODULE 1: SESSION ROUTER & UI ORCHESTRATOR
// ==========================================
class SessionRouter {
  constructor() {
    this.transport = new PeerTransport();
    this.streamer = new PayloadStreamer(this.transport);
    this.renderer = new PayloadRenderer();

    // Export globally for cross-module callbacks
    window.payloadStreamer = this.streamer;
    window.payloadRenderer = this.renderer;

    this.qrInstance = null;
    this.activeStagedFile = null;

    this._bindTransportEvents();
    this._bindDomEvents();
  }

  boot() {
    window.addEventListener('hashchange', () => this._handleRouting());
    this._handleRouting();
  }

  _handleRouting() {
    const rawHash = window.location.hash.slice(1).trim();

    if (rawHash.length > 0) {
      // URL has a hash fragment -> Mobile Receiver Mode
      this._mountReceiverMode(rawHash);
    } else {
      // Root URL without hash -> Desktop Sender Mode
      this._mountSenderMode();
    }
  }

  _mountSenderMode() {
    const senderView = document.getElementById('sender-view');
    const receiverView = document.getElementById('receiver-view');
    if (senderView) senderView.classList.remove('hidden');
    if (receiverView) receiverView.classList.add('hidden');

    const roomId = Utils.generateRoomId();
    const pairingUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;

    // Update Session URL input & testing helper link
    const urlInput = document.getElementById('input-session-url');
    if (urlInput) urlInput.value = pairingUrl;

    const testLink = document.getElementById('link-test-mobile');
    if (testLink) testLink.href = pairingUrl;

    // Render High-DPI QR Code
    this._renderRetinaQr(pairingUrl);

    // Initialize WebRTC Sender
    this.transport.initAsSender(roomId);
  }

  _mountReceiverMode(roomId) {
    const senderView = document.getElementById('sender-view');
    const receiverView = document.getElementById('receiver-view');
    if (senderView) senderView.classList.add('hidden');
    if (receiverView) receiverView.classList.remove('hidden');

    const roomLabel = document.getElementById('receiver-room-label');
    if (roomLabel) roomLabel.textContent = `Room: ${roomId}`;

    this.transport.connectAsReceiver(roomId);
  }

  _renderRetinaQr(url) {
    const box = document.getElementById('qrcode-box');
    if (!box) return;

    box.innerHTML = ''; // Clear loading spinner or previous QR

    try {
      // Render at 512x512 high-resolution with QRCode.CorrectLevel.H (30% recovery)
      // Displayed via CSS max-width 220px to produce crisp high-DPI Retina scanning
      this.qrInstance = new window.QRCode(box, {
        text: url,
        width: 512,
        height: 512,
        colorDark: '#020617',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    } catch (err) {
      box.innerHTML = `<p class="text-xs text-rose-500">Failed to render QR: ${Utils.escapeHtml(err.message)}</p>`;
    }
  }

  _bindTransportEvents() {
    this.transport.onStateChange((state, meta) => {
      this._updateStateUi(state, meta);
    });
  }

  _updateStateUi(state, meta) {
    const statusDot = document.getElementById('connection-indicator-dot');
    const statusText = document.getElementById('connection-status-text');
    const bridgeDot = document.getElementById('bridge-pulse-dot');
    const bridgeMsg = document.getElementById('bridge-status-msg');
    const peerCard = document.getElementById('peer-details-card');
    const peerIdStat = document.getElementById('peer-id-stat');

    const rxDot = document.getElementById('receiver-status-dot');
    const rxMsg = document.getElementById('receiver-status-msg');

    if (state === 'CONNECTING') {
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-ping';
      if (statusText) statusText.textContent = 'Handshaking...';
      if (bridgeDot) bridgeDot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-ping';
      if (bridgeMsg) bridgeMsg.textContent = meta.message || 'Negotiating ICE candidates...';
      if (rxDot) rxDot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-ping';
      if (rxMsg) rxMsg.textContent = 'Connecting...';
    } else if (state === 'CONNECTED') {
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (statusText) statusText.textContent = 'P2P Connected';
      if (bridgeDot) bridgeDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (bridgeMsg) bridgeMsg.textContent = 'Linked with Mobile Receiver';
      if (peerCard) peerCard.classList.remove('hidden');
      if (peerIdStat && meta.peerId) peerIdStat.textContent = `Peer: ${meta.peerId.substring(0, 14)}...`;

      if (rxDot) rxDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (rxMsg) rxMsg.textContent = 'Connected';
    } else if (state === 'DISCONNECTED') {
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      if (statusText) statusText.textContent = meta.readyToPair ? 'Waiting for Scan' : 'Disconnected';
      if (bridgeDot) bridgeDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
      if (bridgeMsg) bridgeMsg.textContent = meta.message || 'Point phone camera at QR code';
      if (peerCard) peerCard.classList.add('hidden');

      if (rxDot) rxDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      if (rxMsg) rxMsg.textContent = 'Disconnected';
    } else if (state === 'ERROR') {
      if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      if (statusText) statusText.textContent = 'Connection Error';
      if (bridgeDot) bridgeDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      if (bridgeMsg) bridgeMsg.textContent = meta.error || 'Connection Failed';

      if (rxDot) rxDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      if (rxMsg) rxMsg.textContent = 'Error';

      Utils.showToast(meta.error || 'WebRTC error', 'error', 5000);
    }
  }

  _bindDomEvents() {
    // 1. Tab Switching (Text vs File)
    const tabBtnText = document.getElementById('tab-btn-text');
    const tabBtnFile = document.getElementById('tab-btn-file');
    const tabContentText = document.getElementById('tab-content-text');
    const tabContentFile = document.getElementById('tab-content-file');

    tabBtnText?.addEventListener('click', () => {
      tabBtnText.className = 'px-3.5 py-1.5 rounded-lg bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5';
      tabBtnFile.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5';
      tabContentText.classList.remove('hidden');
      tabContentFile.classList.add('hidden');
    });

    tabBtnFile?.addEventListener('click', () => {
      tabBtnFile.className = 'px-3.5 py-1.5 rounded-lg bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5';
      tabBtnText.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5';
      tabContentFile.classList.remove('hidden');
      tabContentText.classList.add('hidden');
    });

    // 2. Text Input & Live Meta Calculation
    const textarea = document.getElementById('payload-textarea');
    const charCountEl = document.getElementById('text-char-count');
    const detectedBadge = document.getElementById('text-detected-badge');
    const streamTextBtn = document.getElementById('btn-stream-text');

    const updateTextMetadata = () => {
      const val = textarea.value;
      const count = val.length;
      charCountEl.textContent = `${count} character${count === 1 ? '' : 's'}`;

      if (!val.trim()) {
        detectedBadge.textContent = 'Empty';
        detectedBadge.className = 'px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono text-[11px] border border-slate-700/50';
      } else if (Utils.isValidHttpUrl(val.trim())) {
        detectedBadge.textContent = 'URL Detected';
        detectedBadge.className = 'px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[11px] border border-cyan-500/40';
      } else {
        detectedBadge.textContent = 'Plain Text';
        detectedBadge.className = 'px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700';
      }

      // Stage in-memory automatically
      this.streamer.stageText(val);
    };

    textarea?.addEventListener('input', updateTextMetadata);

    // Paste Action
    const pasteBtn = document.getElementById('btn-paste-clipboard');
    pasteBtn?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        textarea.value = text;
        updateTextMetadata();
        Utils.showToast('Pasted from clipboard', 'info');
      } catch (err) {
        Utils.showToast('Please grant clipboard permission to paste', 'error');
      }
    });

    // Clear Action
    const clearBtn = document.getElementById('btn-clear-text');
    clearBtn?.addEventListener('click', () => {
      textarea.value = '';
      updateTextMetadata();
    });

    // Stream Text Button
    streamTextBtn?.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        Utils.showToast('Please input text or a URL first', 'error');
        return;
      }
      this.streamer.sendText(text);
    });

    // 3. File Input & Drag and Drop Handling
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stagedFileCard = document.getElementById('staged-file-card');
    const stagedFileName = document.getElementById('staged-file-name');
    const stagedFileSize = document.getElementById('staged-file-size');
    const removeFileBtn = document.getElementById('btn-remove-staged-file');
    const streamFileBtn = document.getElementById('btn-stream-file');

    dropZone?.addEventListener('click', () => fileInput.click());

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('border-cyan-400', 'bg-cyan-500/5');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('border-cyan-400', 'bg-cyan-500/5');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-cyan-400', 'bg-cyan-500/5');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this._handleSelectedFile(e.dataTransfer.files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this._handleSelectedFile(e.target.files[0]);
      }
    });

    removeFileBtn?.addEventListener('click', () => {
      this.activeStagedFile = null;
      this.streamer.clearStaged();
      fileInput.value = '';
      stagedFileCard.classList.add('hidden');
      streamFileBtn.disabled = true;
    });

    streamFileBtn?.addEventListener('click', () => {
      if (!this.activeStagedFile) return;

      const progressBox = document.getElementById('transfer-progress-box');
      const progressBar = document.getElementById('transfer-progress-bar');
      const progressTitle = document.getElementById('transfer-file-title');
      const progressSpeed = document.getElementById('transfer-speed-stat');
      const progressBytes = document.getElementById('transfer-bytes-stat');
      const progressChunk = document.getElementById('transfer-chunk-stat');

      if (progressBox) progressBox.classList.remove('hidden');
      if (progressTitle) progressTitle.textContent = this.activeStagedFile.name;

      this.streamer.sendFile(this.activeStagedFile, (p) => {
        if (progressBar) progressBar.style.width = `${p.percent}%`;
        if (progressSpeed) progressSpeed.textContent = `${p.speed} • ${p.percent}%`;
        if (progressBytes) progressBytes.textContent = `${Utils.formatBytes(p.sentBytes)} / ${Utils.formatBytes(p.totalBytes)}`;
        if (progressChunk) progressChunk.textContent = `Chunk ${p.currentChunk} / ${p.totalChunks}`;
      });
    });

    // 4. Session Action Buttons (Copy Link, New Room, Mobile Reconnect)
    const copyUrlBtn = document.getElementById('btn-copy-url');
    copyUrlBtn?.addEventListener('click', () => {
      const url = document.getElementById('input-session-url').value;
      navigator.clipboard.writeText(url);
      Utils.showToast('Direct pairing URL copied!', 'success');
      const label = document.getElementById('copy-btn-label');
      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = 'Copy'; }, 2000);
      }
    });

    const refreshRoomBtn = document.getElementById('btn-refresh-room');
    refreshRoomBtn?.addEventListener('click', () => {
      const newRoom = Utils.generateRoomId();
      const pairingUrl = `${window.location.origin}${window.location.pathname}#${newRoom}`;
      document.getElementById('input-session-url').value = pairingUrl;
      document.getElementById('link-test-mobile').href = pairingUrl;
      this._renderRetinaQr(pairingUrl);
      this.transport.initAsSender(newRoom);
      Utils.showToast('Fresh room session generated', 'info');
    });

    const reconnectMobileBtn = document.getElementById('btn-reconnect-mobile');
    reconnectMobileBtn?.addEventListener('click', () => {
      const target = window.location.hash.slice(1).trim();
      if (target) {
        this.transport.connectAsReceiver(target);
        Utils.showToast('Reconnecting to room...', 'info');
      }
    });

    // 5. Architecture Modal
    const infoBtn = document.getElementById('btn-info-modal');
    const modal = document.getElementById('info-modal');
    const closeModal = document.getElementById('btn-close-modal');
    const dismissModal = document.getElementById('btn-dismiss-modal');

    infoBtn?.addEventListener('click', () => modal.classList.remove('hidden'));
    closeModal?.addEventListener('click', () => modal.classList.add('hidden'));
    dismissModal?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  _handleSelectedFile(file) {
    if (!file) return;

    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
      Utils.showToast(`File size (${Utils.formatBytes(file.size)}) exceeds 50MB limit`, 'error', 4000);
      return;
    }

    this.activeStagedFile = file;
    this.streamer.stageFile(file);

    const stagedFileCard = document.getElementById('staged-file-card');
    const stagedFileName = document.getElementById('staged-file-name');
    const stagedFileSize = document.getElementById('staged-file-size');
    const streamFileBtn = document.getElementById('btn-stream-file');

    if (stagedFileName) stagedFileName.textContent = file.name;
    if (stagedFileSize) stagedFileSize.textContent = `${Utils.formatBytes(file.size)} • ${file.type || 'binary'}`;
    if (stagedFileCard) stagedFileCard.classList.remove('hidden');
    if (streamFileBtn) streamFileBtn.disabled = false;

    Utils.showToast(`Staged ${file.name} in-memory`, 'info');
  }
}

// ==========================================
// BOOTSTRAP APPLICATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const app = new SessionRouter();
  app.boot();
});
