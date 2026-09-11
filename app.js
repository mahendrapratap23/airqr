/**
 * AirQR — Main Application Controller
 * Orchestrates routing, DOM events, and modules.
 * Path: app.js
 */

import { PeerTransportManager } from './src/transport/peer_manager.js';
import { BinaryChunkStreamer, BinaryChunkAssembler } from './src/streamer/chunker.js';
import { renderMobilePayload, escapeHtml, formatBytes, triggerHaptic } from './src/renderers/payload_viewer.js';

class AirQRApp {
  constructor() {
    this.peerManager = new PeerTransportManager();
    this.streamer = new BinaryChunkStreamer(this.peerManager);
    this.assembler = new BinaryChunkAssembler();

    this.currentMode = null; // 'sender' | 'receiver'
    this.stagedText = null;
    this.stagedFile = null;
    this.qrInstance = null;

    this._bindTransportEvents();
    this._bindDomEvents();
  }

  /**
   * Boots the application and initializes routing based on location hash.
   */
  boot() {
    window.addEventListener('hashchange', () => this._handleRouting());
    this._handleRouting();
  }

  /**
   * Inspects window.location.hash:
   * - No hash -> Desktop Sender Mode
   * - With hash -> Mobile Receiver Mode
   * @private
   */
  _handleRouting() {
    const hash = window.location.hash.slice(1).trim();

    if (hash.length > 0) {
      this._mountReceiverMode(hash);
    } else {
      this._mountSenderMode();
    }
  }

  /**
   * Initializes Desktop Sender mode.
   * Generates room ID, renders Retina QR canvas, and listens for connections.
   * @private
   */
  _mountSenderMode() {
    this.currentMode = 'sender';

    const senderView = document.getElementById('sender-view');
    const receiverView = document.getElementById('receiver-view');
    if (senderView) senderView.classList.remove('hidden');
    if (receiverView) receiverView.classList.add('hidden');

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const roomId = `airqr-${randomSuffix}`;
    const pairUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;

    // Update session link input & testing link
    const sessionInput = document.getElementById('input-session-url');
    if (sessionInput) sessionInput.value = pairUrl;

    const testLink = document.getElementById('link-test-mobile');
    if (testLink) testLink.href = pairUrl;

    const roomIdPill = document.getElementById('room-id-pill');
    if (roomIdPill) roomIdPill.textContent = roomId;

    // Render High-DPI QR Code
    this._renderQrCode(pairUrl);

    // Initialize Sender Peer
    this.peerManager.initSender(roomId);
  }

  /**
   * Initializes Mobile Receiver mode.
   * Connects to the room ID specified in the hash.
   * @param {string} targetRoomId 
   * @private
   */
  _mountReceiverMode(targetRoomId) {
    this.currentMode = 'receiver';

    const senderView = document.getElementById('sender-view');
    const receiverView = document.getElementById('receiver-view');
    if (senderView) senderView.classList.add('hidden');
    if (receiverView) receiverView.classList.remove('hidden');

    const receiverRoomLabel = document.getElementById('receiver-room-label');
    if (receiverRoomLabel) receiverRoomLabel.textContent = `Room: ${targetRoomId}`;

    this.peerManager.connectToPeer(targetRoomId);
  }

  /**
   * Generates a 512x512 high-resolution QR code for instant mobile camera detection.
   * @param {string} url 
   * @private
   */
  _renderQrCode(url) {
    const box = document.getElementById('qrcode-box');
    if (!box) return;

    box.innerHTML = '';
    try {
      this.qrInstance = new window.QRCode(box, {
        text: url,
        width: 512,
        height: 512,
        colorDark: '#020617',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    } catch (err) {
      box.innerHTML = `<p class="text-xs text-rose-400">QR Generation error: ${escapeHtml(err.message)}</p>`;
    }
  }

  /**
   * Binds to typed events emitted by PeerTransportManager.
   * @private
   */
  _bindTransportEvents() {
    this.peerManager.addEventListener('peer_ready', (e) => {
      this._updateStatus('Waiting for Scan', 'amber', 'Point phone camera at QR code');
    });

    this.peerManager.addEventListener('peer_connected', (e) => {
      triggerHaptic();
      this._updateStatus('Connected', 'emerald', 'Encrypted WebRTC DataChannel established');
      
      const peerIdStat = document.getElementById('peer-id-stat');
      if (peerIdStat) {
        peerIdStat.textContent = `Peer: ${e.detail.peerId.substring(0, 12)}...`;
      }
      const peerCard = document.getElementById('peer-details-card');
      if (peerCard) peerCard.classList.remove('hidden');

      // Auto-State Sync: transmit staged payload immediately if uploaded before scan
      this._dispatchStagedPayload();
    });

    this.peerManager.addEventListener('peer_disconnected', (e) => {
      this._updateStatus('Disconnected', 'amber', e.detail.message || 'Peer connection dropped');
      const peerCard = document.getElementById('peer-details-card');
      if (peerCard) peerCard.classList.add('hidden');
    });

    this.peerManager.addEventListener('transfer_error', (e) => {
      this._updateStatus('Error', 'rose', e.detail.error || 'WebRTC error encountered');
      this._showToast(e.detail.error || 'Connection error', 'error');
    });

    this.peerManager.addEventListener('data_received', (e) => {
      this._handleIncomingData(e.detail.data);
    });
  }

  /**
   * Processes incoming data packets from the peer.
   * @param {Object} data 
   * @private
   */
  _handleIncomingData(data) {
    if (!data) return;

    // Check if it's structured text/URL
    if (data.type === 'TEXT_PAYLOAD' || data.type === 'text') {
      const container = document.getElementById('receiver-payload-box');
      const waitingBox = document.getElementById('receiver-waiting-box');
      if (waitingBox) waitingBox.classList.add('hidden');
      if (container) container.classList.remove('hidden');

      renderMobilePayload({
        type: 'text',
        text: data.payload || data.text,
        isUrl: data.isUrl,
        timestamp: data.timestamp || Date.now()
      }, container);
      return;
    }

    // Binary file chunk framing protocol
    if (data.type === 'FILE_START' || data.type === 'FILE_CHUNK' || data.type === 'FILE_END') {
      const progressBox = document.getElementById('receiver-progress-box');
      const waitingBox = document.getElementById('receiver-waiting-box');
      const container = document.getElementById('receiver-payload-box');

      this.assembler.handleFrame(
        data,
        (transferred, total, percent, speed, fileName) => {
          if (waitingBox) waitingBox.classList.add('hidden');
          if (progressBox) progressBox.classList.remove('hidden');

          const rxFileName = document.getElementById('rx-file-name');
          const rxBar = document.getElementById('rx-progress-bar');
          const rxSpeed = document.getElementById('rx-speed-stat');
          const rxBytes = document.getElementById('rx-bytes-stat');

          if (rxFileName && fileName) rxFileName.textContent = fileName;
          if (rxBar) rxBar.style.width = `${percent}%`;
          if (rxSpeed) rxSpeed.textContent = `${speed} • ${percent}%`;
          if (rxBytes) rxBytes.textContent = `${formatBytes(transferred)} / ${formatBytes(total)}`;
        },
        (filePayload) => {
          if (progressBox) progressBox.classList.add('hidden');
          if (container) container.classList.remove('hidden');
          renderMobilePayload(filePayload, container);
          this._showToast(`Received ${filePayload.name}`, 'success');
        }
      );
    }
  }

  /**
   * Transmits any text or file payload that was staged before the peer connected.
   * @private
   */
  _dispatchStagedPayload() {
    if (this.stagedText) {
      this._transmitText(this.stagedText);
    }
    if (this.stagedFile) {
      this._transmitFile(this.stagedFile);
    }
  }

  /**
   * Transmits text or link payload.
   * @param {string} text 
   * @private
   */
  _transmitText(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      this.peerManager.send({
        type: 'TEXT_PAYLOAD',
        payload: trimmed,
        timestamp: Date.now()
      });
      triggerHaptic();
      this._showToast('Text transmitted to mobile', 'success');
    } catch (err) {
      this._showToast(`Transmission error: ${err.message}`, 'error');
    }
  }

  /**
   * Transmits file using BinaryChunkStreamer with backpressure flow control.
   * @param {File} file 
   * @private
   */
  async _transmitFile(file) {
    if (!file) return;

    const progressBox = document.getElementById('transfer-progress-box');
    const progressBar = document.getElementById('transfer-progress-bar');
    const progressTitle = document.getElementById('transfer-file-title');
    const progressSpeed = document.getElementById('transfer-speed-stat');
    const progressBytes = document.getElementById('transfer-bytes-stat');
    const progressChunk = document.getElementById('transfer-chunk-stat');

    if (progressBox) progressBox.classList.remove('hidden');
    if (progressTitle) progressTitle.textContent = file.name;

    try {
      await this.streamer.streamFile(file, (sentBytes, totalBytes, percent, speed) => {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressSpeed) progressSpeed.textContent = `${speed} • ${percent}%`;
        if (progressBytes) progressBytes.textContent = `${formatBytes(sentBytes)} / ${formatBytes(totalBytes)}`;
        if (progressChunk) {
          const currentChunk = Math.ceil(sentBytes / (16 * 1024));
          const totalChunks = Math.ceil(totalBytes / (16 * 1024));
          progressChunk.textContent = `Chunk ${currentChunk} / ${totalChunks}`;
        }
      });
      triggerHaptic();
      this._showToast(`Transfer complete: ${file.name}`, 'success');
    } catch (err) {
      this._showToast(`Transfer failed: ${err.message}`, 'error');
    }
  }

  /**
   * Updates state indicator pills and badges.
   * @private
   */
  _updateStatus(stateLabel, color, message) {
    const colorClasses = {
      emerald: {
        dot: 'w-2 h-2 rounded-full bg-emerald-400',
        pill: 'border-emerald-500/40 text-emerald-300'
      },
      amber: {
        dot: 'w-2 h-2 rounded-full bg-amber-400 animate-pulse',
        pill: 'border-amber-500/40 text-amber-300'
      },
      rose: {
        dot: 'w-2 h-2 rounded-full bg-rose-500',
        pill: 'border-rose-500/40 text-rose-300'
      },
      cyan: {
        dot: 'w-2 h-2 rounded-full bg-cyan-400 animate-ping',
        pill: 'border-cyan-500/40 text-cyan-300'
      }
    };

    const cfg = colorClasses[color] || colorClasses.amber;

    // Desktop Pill
    const dot = document.getElementById('connection-indicator-dot');
    const statusText = document.getElementById('connection-status-text');
    if (dot) dot.className = cfg.dot;
    if (statusText) statusText.textContent = stateLabel;

    // Bridge Status
    const bridgeDot = document.getElementById('bridge-pulse-dot');
    const bridgeMsg = document.getElementById('bridge-status-msg');
    if (bridgeDot) bridgeDot.className = cfg.dot;
    if (bridgeMsg) bridgeMsg.textContent = message;

    // Mobile Receiver Pill
    const rxDot = document.getElementById('receiver-status-dot');
    const rxMsg = document.getElementById('receiver-status-msg');
    if (rxDot) rxDot.className = cfg.dot;
    if (rxMsg) rxMsg.textContent = stateLabel;
  }

  /**
   * Binds all DOM elements, dropzone, text inputs, tabs, and buttons.
   * @private
   */
  _bindDomEvents() {
    // 1. Composer Tabs
    const tabText = document.getElementById('tab-btn-text');
    const tabFile = document.getElementById('tab-btn-file');
    const contentText = document.getElementById('tab-content-text');
    const contentFile = document.getElementById('tab-content-file');

    tabText?.addEventListener('click', () => {
      tabText.className = 'px-3.5 py-1.5 rounded-lg bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5';
      tabFile.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5';
      contentText?.classList.remove('hidden');
      contentFile?.classList.add('hidden');
    });

    tabFile?.addEventListener('click', () => {
      tabFile.className = 'px-3.5 py-1.5 rounded-lg bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5';
      tabText.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5';
      contentFile?.classList.remove('hidden');
      contentText?.classList.add('hidden');
    });

    // 2. Text Input & Live Meta
    const textarea = document.getElementById('payload-textarea');
    const charCountEl = document.getElementById('text-char-count');
    const detectedBadge = document.getElementById('text-detected-badge');
    const streamTextBtn = document.getElementById('btn-stream-text');

    textarea?.addEventListener('input', () => {
      const val = textarea.value;
      this.stagedText = val.trim() ? val : null;
      if (charCountEl) charCountEl.textContent = `${val.length} character${val.length === 1 ? '' : 's'}`;

      if (detectedBadge) {
        if (!val.trim()) {
          detectedBadge.textContent = 'Empty';
          detectedBadge.className = 'px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[11px] border border-slate-700/50';
        } else if (/^https?:\/\//i.test(val.trim())) {
          detectedBadge.textContent = 'URL Detected';
          detectedBadge.className = 'px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[11px] border border-cyan-500/40';
        } else {
          detectedBadge.textContent = 'Plain Text';
          detectedBadge.className = 'px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700';
        }
      }
    });

    // Paste Action
    const pasteBtn = document.getElementById('btn-paste-clipboard');
    pasteBtn?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (textarea) {
          textarea.value = text;
          textarea.dispatchEvent(new Event('input'));
          this._showToast('Pasted from clipboard', 'info');
        }
      } catch {
        this._showToast('Clipboard permission required', 'error');
      }
    });

    // Clear Action
    const clearBtn = document.getElementById('btn-clear-text');
    clearBtn?.addEventListener('click', () => {
      if (textarea) {
        textarea.value = '';
        textarea.dispatchEvent(new Event('input'));
      }
    });

    // Send Text Button
    streamTextBtn?.addEventListener('click', () => {
      if (this.stagedText) {
        this._transmitText(this.stagedText);
      } else {
        this._showToast('Please input text or a URL first', 'error');
      }
    });

    // 3. Drop Zone & File Management
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const stagedFileCard = document.getElementById('staged-file-card');
    const stagedFileName = document.getElementById('staged-file-name');
    const stagedFileSize = document.getElementById('staged-file-size');
    const removeFileBtn = document.getElementById('btn-remove-staged-file');
    const streamFileBtn = document.getElementById('btn-stream-file');

    dropZone?.addEventListener('click', () => fileInput?.click());

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
        this._selectFile(e.dataTransfer.files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this._selectFile(e.target.files[0]);
      }
    });

    removeFileBtn?.addEventListener('click', () => {
      this.stagedFile = null;
      if (fileInput) fileInput.value = '';
      stagedFileCard?.classList.add('hidden');
      if (streamFileBtn) streamFileBtn.disabled = true;
    });

    streamFileBtn?.addEventListener('click', () => {
      if (this.stagedFile) {
        this._transmitFile(this.stagedFile);
      }
    });

    // 4. Session Controls: Copy URL, Regenerate, Reconnect
    const copyUrlBtn = document.getElementById('btn-copy-url');
    copyUrlBtn?.addEventListener('click', () => {
      const input = document.getElementById('input-session-url');
      if (input) {
        navigator.clipboard.writeText(input.value);
        this._showToast('Pairing link copied!', 'success');
        const label = document.getElementById('copy-btn-label');
        if (label) {
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = 'Copy'; }, 2000);
        }
      }
    });

    const refreshRoomBtn = document.getElementById('btn-refresh-room');
    refreshRoomBtn?.addEventListener('click', () => {
      window.location.hash = '';
      this._mountSenderMode();
      this._showToast('Fresh room session generated', 'info');
    });

    const reconnectMobileBtn = document.getElementById('btn-reconnect-mobile');
    reconnectMobileBtn?.addEventListener('click', () => {
      const hash = window.location.hash.slice(1).trim();
      if (hash) {
        this.peerManager.connectToPeer(hash);
        this._showToast('Reconnecting...', 'info');
      }
    });

    // 5. Info Modal
    const infoBtn = document.getElementById('btn-info-modal');
    const modal = document.getElementById('info-modal');
    const closeModal = document.getElementById('btn-close-modal');
    const dismissModal = document.getElementById('btn-dismiss-modal');

    infoBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
    closeModal?.addEventListener('click', () => modal?.classList.add('hidden'));
    dismissModal?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  /**
   * Stages a selected file for transfer.
   * @param {File} file 
   * @private
   */
  _selectFile(file) {
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      this._showToast('File exceeds 50MB maximum limit', 'error');
      return;
    }

    this.stagedFile = file;

    const stagedFileCard = document.getElementById('staged-file-card');
    const stagedFileName = document.getElementById('staged-file-name');
    const stagedFileSize = document.getElementById('staged-file-size');
    const streamFileBtn = document.getElementById('btn-stream-file');

    if (stagedFileName) stagedFileName.textContent = file.name;
    if (stagedFileSize) stagedFileSize.textContent = `${formatBytes(file.size)} • ${file.type || 'binary'}`;
    if (stagedFileCard) stagedFileCard.classList.remove('hidden');
    if (streamFileBtn) streamFileBtn.disabled = false;

    this._showToast(`Staged ${file.name} in-memory`, 'info');
  }

  _showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success'
      ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
      : type === 'error'
      ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
      : 'bg-slate-900/90 border-slate-700 text-slate-200';

    toast.className = `px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium flex items-center gap-2 transform translate-y-2 opacity-0 transition-all duration-200 pointer-events-auto ${bgClass}`;
    toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const app = new AirQRApp();
  app.boot();
});
