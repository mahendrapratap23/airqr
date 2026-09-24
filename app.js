/**
 * AirQR — Main Application Controller
 * Orchestrates routing, DOM events, WebRTC lifecycle, and bidirectional session interactions.
 * Path: app.js
 */

import { PeerTransportManager } from './src/transport/peer_manager.js?v=3';
import { BinaryChunkStreamer, BinaryChunkAssembler } from './src/streamer/chunker.js?v=3';
import { renderMobilePayload, escapeHtml, formatBytes, triggerHaptic } from './src/renderers/payload_viewer.js?v=3';

class AirQRApp {
  constructor() {
    this.peerManager = new PeerTransportManager();
    this.streamer = new BinaryChunkStreamer(this.peerManager);
    this.assembler = new BinaryChunkAssembler();      // Receiver-side assembler (mobile)
    this.desktopAssembler = new BinaryChunkAssembler(); // Desktop-side assembler for incoming mobile files

    this.currentMode = null; // 'sender' | 'receiver'
    this.stagedText = null;
    this.stagedFile = null;
    this.mobileStagedText = null;  // Mobile composer text
    this.mobileStagedFile = null;  // Mobile composer file
    this.qrInstance = null;
    this.soundEnabled = localStorage.getItem('airqr_sound') !== 'false';
    this.sessionHistory = [];
    this.audioCtx = null;

    this._bindTransportEvents();
    this._bindDomEvents();
    this._bindMobileSendEvents();
    this._initAudio();
  }

  /**
   * Initializes lightweight Web Audio synth for crisp tactile feedback.
   * @private
   */
  _initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch {
      this.audioCtx = null;
    }
  }

  /**
   * Plays a subtle, tactile click/pop sound via synthesized sine wave.
   * @param {'click' | 'success' | 'connect'} type 
   * @private
   */
  _playSound(type = 'click') {
    if (!this.soundEnabled || !this.audioCtx) return;

    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.start(now);
        osc.stop(now + 0.035);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.06); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (type === 'connect') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.13);
      }
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /**
   * Boots the application and initializes routing based on location hash.
   */
  boot() {
    window.addEventListener('hashchange', () => this._handleRouting());
    this._handleRouting();
    this._updateSoundUi();
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
   * Generates a crisp high-resolution QR code.
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
        colorDark: '#09090b',
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
    this.peerManager.addEventListener('peer_ready', () => {
      this._updateStatus('Ready for Scan', 'amber', 'Point phone camera at QR code');
    });

    this.peerManager.addEventListener('peer_connected', (e) => {
      triggerHaptic();
      this._playSound('connect');
      this._updateStatus('Connected', 'emerald', 'Encrypted WebRTC DataChannel active');
      
      const peerIdStat = document.getElementById('peer-id-stat');
      if (peerIdStat) {
        peerIdStat.textContent = `Peer: ${e.detail.peerId.substring(0, 14)}...`;
      }
      const peerCard = document.getElementById('peer-details-card');
      if (peerCard) peerCard.classList.remove('hidden');

      this._showToast('Mobile device linked via P2P', 'success');

      // Show the Send to Laptop section on mobile when connected
      const mobileSendSection = document.getElementById('mobile-send-section');
      if (mobileSendSection) mobileSendSection.classList.remove('hidden');

      // Auto-State Sync: transmit staged payload immediately if uploaded before scan
      this._dispatchStagedPayload();
    });

    this.peerManager.addEventListener('peer_disconnected', (e) => {
      this._updateStatus('Disconnected', 'amber', e.detail.message || 'Peer connection closed');
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
   * Routes to the correct handler based on current mode.
   * @param {Object} data 
   * @private
   */
  _handleIncomingData(data) {
    if (!data) return;

    if (this.currentMode === 'sender') {
      this._handleDesktopIncomingData(data);
    } else {
      this._handleMobileIncomingData(data);
    }
  }

  /**
   * Handles incoming data on the DESKTOP side (received from mobile).
   * @param {Object} data 
   * @private
   */
  _handleDesktopIncomingData(data) {
    // Text/URL from mobile
    if (data.type === 'TEXT_PAYLOAD' || data.type === 'text') {
      const receivedCard = document.getElementById('desktop-received-card');
      const container = document.getElementById('desktop-received-payload-box');
      if (receivedCard) receivedCard.classList.remove('hidden');
      if (container) container.classList.remove('hidden');

      const textVal = data.payload || data.text;
      renderMobilePayload({
        type: 'text',
        text: textVal,
        isUrl: data.isUrl,
        timestamp: data.timestamp || Date.now()
      }, container);

      this._playSound('success');
      this._showToast('Received text from mobile', 'success');
      this._addActivityLog({
        type: 'text',
        name: textVal.length > 30 ? textVal.substring(0, 30) + '...' : textVal,
        detail: `${textVal.length} chars • from mobile`,
        timestamp: Date.now()
      });
      return;
    }

    // Binary file from mobile
    if (data.type === 'FILE_START' || data.type === 'FILE_CHUNK' || data.type === 'FILE_END') {
      const progressBox = document.getElementById('desktop-rx-progress-box');
      const receivedCard = document.getElementById('desktop-received-card');
      const container = document.getElementById('desktop-received-payload-box');

      this.desktopAssembler.handleFrame(
        data,
        (transferred, total, percent, speed, fileName) => {
          if (progressBox) progressBox.classList.remove('hidden');

          const rxFileName = document.getElementById('desktop-rx-file-name');
          const rxBar = document.getElementById('desktop-rx-progress-bar');
          const rxSpeed = document.getElementById('desktop-rx-speed-stat');
          const rxBytes = document.getElementById('desktop-rx-bytes-stat');

          if (rxFileName && fileName) rxFileName.textContent = fileName;
          if (rxBar) rxBar.style.width = `${percent}%`;
          if (rxSpeed) rxSpeed.textContent = `${speed} • ${percent}%`;
          if (rxBytes) rxBytes.textContent = `${formatBytes(transferred)} / ${formatBytes(total)}`;
        },
        (filePayload) => {
          if (progressBox) progressBox.classList.add('hidden');
          if (receivedCard) receivedCard.classList.remove('hidden');
          if (container) container.classList.remove('hidden');
          renderMobilePayload(filePayload, container);
          this._playSound('success');
          this._showToast(`Received ${filePayload.name} from mobile`, 'success');

          this._addActivityLog({
            type: 'file',
            name: filePayload.name,
            detail: `${formatBytes(filePayload.size)} • from mobile`,
            timestamp: Date.now()
          });
        }
      );
    }
  }

  /**
   * Handles incoming data on the MOBILE side (received from desktop).
   * @param {Object} data 
   * @private
   */
  _handleMobileIncomingData(data) {
    // Check if it's structured text/URL
    if (data.type === 'TEXT_PAYLOAD' || data.type === 'text') {
      const container = document.getElementById('receiver-payload-box');
      const waitingBox = document.getElementById('receiver-waiting-box');
      if (waitingBox) waitingBox.classList.add('hidden');
      if (container) container.classList.remove('hidden');

      const textVal = data.payload || data.text;
      renderMobilePayload({
        type: 'text',
        text: textVal,
        isUrl: data.isUrl,
        timestamp: data.timestamp || Date.now()
      }, container);

      this._playSound('success');
      this._addActivityLog({
        type: 'text',
        name: textVal.length > 30 ? textVal.substring(0, 30) + '...' : textVal,
        detail: `${textVal.length} chars`,
        timestamp: Date.now()
      });
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
          this._playSound('success');
          this._showToast(`Received ${filePayload.name}`, 'success');

          this._addActivityLog({
            type: 'file',
            name: filePayload.name,
            detail: formatBytes(filePayload.size),
            timestamp: Date.now()
          });
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
      this._playSound('success');
      this._showToast('Text transmitted to mobile', 'success');

      this._addActivityLog({
        type: 'text',
        name: trimmed.length > 30 ? trimmed.substring(0, 30) + '...' : trimmed,
        detail: `${trimmed.length} chars`,
        timestamp: Date.now()
      });
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
          progressChunk.textContent = `Chunk ${currentChunk} of ${totalChunks}`;
        }
      });
      triggerHaptic();
      this._playSound('success');
      this._showToast(`Transfer complete: ${file.name}`, 'success');

      this._addActivityLog({
        type: 'file',
        name: file.name,
        detail: formatBytes(file.size),
        timestamp: Date.now()
      });
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
        pill: 'border-emerald-500/30 text-emerald-300'
      },
      amber: {
        dot: 'w-2 h-2 rounded-full bg-amber-400',
        pill: 'border-amber-500/30 text-amber-300'
      },
      rose: {
        dot: 'w-2 h-2 rounded-full bg-rose-500',
        pill: 'border-rose-500/30 text-rose-300'
      },
      blue: {
        dot: 'w-2 h-2 rounded-full bg-blue-400',
        pill: 'border-blue-500/30 text-blue-300'
      }
    };

    const cfg = colorClasses[color] || colorClasses.amber;

    // Desktop Pill
    const dot = document.getElementById('connection-indicator-dot');
    const statusText = document.getElementById('connection-status-text');
    if (dot) dot.className = cfg.dot;
    if (statusText) statusText.textContent = stateLabel;

    // Bridge Status Card
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
   * Adds an item to the session transmission history feed.
   * @private
   */
  _addActivityLog(item) {
    this.sessionHistory.unshift(item);

    const list = document.getElementById('session-activity-list');
    const placeholder = document.getElementById('activity-empty-placeholder');
    if (placeholder) placeholder.remove();

    if (!list) return;

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2.5 rounded-lg bg-[#0b0c0e] border border-white/[0.06] text-xs animate-in fade-in duration-200';

    const isFile = item.type === 'file';
    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      <div class="flex items-center gap-2.5 overflow-hidden">
        <div class="w-6 h-6 rounded bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 flex-shrink-0">
          ${isFile ? `
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/></svg>
          ` : `
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
          `}
        </div>
        <div class="min-w-0">
          <p class="font-medium text-zinc-200 truncate max-w-[200px] sm:max-w-xs">${escapeHtml(item.name)}</p>
          <p class="text-[11px] text-zinc-500 font-mono tabular-nums">${item.detail}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-[10px] text-zinc-500 font-mono tabular-nums">${timeStr}</span>
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      </div>
    `;

    list.insertBefore(row, list.firstChild);

    const badge = document.getElementById('activity-count-badge');
    if (badge) {
      badge.textContent = `${this.sessionHistory.length} item${this.sessionHistory.length === 1 ? '' : 's'}`;
    }
  }

  /**
   * Updates sound toggle UI state.
   * @private
   */
  _updateSoundUi() {
    const onIcon = document.getElementById('icon-sound-on');
    const offIcon = document.getElementById('icon-sound-off');
    if (onIcon && offIcon) {
      if (this.soundEnabled) {
        onIcon.classList.remove('hidden');
        offIcon.classList.add('hidden');
      } else {
        onIcon.classList.add('hidden');
        offIcon.classList.remove('hidden');
      }
    }
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
      this._playSound('click');
      tabText.className = 'px-3 py-1 rounded-md bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50 transition-all flex items-center gap-1.5';
      tabFile.className = 'px-3 py-1 rounded-md text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5';
      contentText?.classList.remove('hidden');
      contentFile?.classList.add('hidden');
    });

    tabFile?.addEventListener('click', () => {
      this._playSound('click');
      tabFile.className = 'px-3 py-1 rounded-md bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50 transition-all flex items-center gap-1.5';
      tabText.className = 'px-3 py-1 rounded-md text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1.5';
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
          detectedBadge.className = 'px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-mono text-[11px] border border-zinc-700/50';
        } else if (/^https?:\/\//i.test(val.trim())) {
          detectedBadge.textContent = 'URL Detected';
          detectedBadge.className = 'px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[11px] border border-blue-500/20';
        } else {
          detectedBadge.textContent = 'Plain Text';
          detectedBadge.className = 'px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px] border border-zinc-700';
        }
      }
    });

    // Keyboard shortcut: ⌘+Enter or Ctrl+Enter to transmit text
    textarea?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        streamTextBtn?.click();
      }
    });

    // Paste Action
    const pasteBtn = document.getElementById('btn-paste-clipboard');
    pasteBtn?.addEventListener('click', async () => {
      this._playSound('click');
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
      this._playSound('click');
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
    const removeFileBtn = document.getElementById('btn-remove-staged-file');
    const streamFileBtn = document.getElementById('btn-stream-file');

    dropZone?.addEventListener('click', () => fileInput?.click());

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-active');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-active');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this._selectFile(e.dataTransfer.files[0]);
      }
    });

    // Global Window Drag & Drop Overlay
    const globalOverlay = document.getElementById('global-drop-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (globalOverlay && e.dataTransfer.types.includes('Files')) {
        globalOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && globalOverlay) {
        globalOverlay.classList.add('hidden');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (globalOverlay) globalOverlay.classList.add('hidden');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // Automatically switch to file tab if on sender view
        tabFile?.click();
        this._selectFile(e.dataTransfer.files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this._selectFile(e.target.files[0]);
      }
    });

    removeFileBtn?.addEventListener('click', () => {
      this._playSound('click');
      this.stagedFile = null;
      if (fileInput) fileInput.value = '';
      const stagedCard = document.getElementById('staged-file-card');
      stagedCard?.classList.add('hidden');
      if (streamFileBtn) streamFileBtn.disabled = true;
    });

    streamFileBtn?.addEventListener('click', () => {
      if (this.stagedFile) {
        this._transmitFile(this.stagedFile);
      }
    });

    // 4. Session Controls: Copy URL, Regenerate, Reconnect, Sound
    const copyUrlBtn = document.getElementById('btn-copy-url');
    copyUrlBtn?.addEventListener('click', () => {
      this._playSound('click');
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
      this._playSound('click');
      window.location.hash = '';
      this._mountSenderMode();
      this._showToast('Fresh room session generated', 'info');
    });

    const reconnectMobileBtn = document.getElementById('btn-reconnect-mobile');
    reconnectMobileBtn?.addEventListener('click', () => {
      this._playSound('click');
      const hash = window.location.hash.slice(1).trim();
      if (hash) {
        this.peerManager.connectToPeer(hash);
        this._showToast('Reconnecting...', 'info');
      }
    });

    // Sound toggle
    const soundToggleBtn = document.getElementById('btn-toggle-sound');
    soundToggleBtn?.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem('airqr_sound', String(this.soundEnabled));
      this._updateSoundUi();
      if (this.soundEnabled) {
        this._playSound('click');
        this._showToast('Sound effects enabled', 'info');
      } else {
        this._showToast('Sound effects muted', 'info');
      }
    });

    // 5. Info Modal
    const infoBtn = document.getElementById('btn-info-modal');
    const modal = document.getElementById('info-modal');
    const closeModal = document.getElementById('btn-close-modal');
    const dismissModal = document.getElementById('btn-dismiss-modal');

    infoBtn?.addEventListener('click', () => {
      this._playSound('click');
      modal?.classList.remove('hidden');
    });
    closeModal?.addEventListener('click', () => modal?.classList.add('hidden'));
    dismissModal?.addEventListener('click', () => modal?.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    });
  }

  /**
   * Binds all mobile "Send to Laptop" composer interactions.
   * Handles text/file tab switching, file staging, and transmit actions.
   * @private
   */
  _bindMobileSendEvents() {
    // Mobile Tab Switching
    const mobileTabText = document.getElementById('mobile-tab-text');
    const mobileTabFile = document.getElementById('mobile-tab-file');
    const mobileTextComposer = document.getElementById('mobile-text-composer');
    const mobileFileComposer = document.getElementById('mobile-file-composer');

    mobileTabText?.addEventListener('click', () => {
      this._playSound('click');
      mobileTabText.className = 'px-2 py-0.5 rounded bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50 transition-all';
      mobileTabFile.className = 'px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-all';
      mobileTextComposer?.classList.remove('hidden');
      mobileFileComposer?.classList.add('hidden');
    });

    mobileTabFile?.addEventListener('click', () => {
      this._playSound('click');
      mobileTabFile.className = 'px-2 py-0.5 rounded bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50 transition-all';
      mobileTabText.className = 'px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-all';
      mobileFileComposer?.classList.remove('hidden');
      mobileTextComposer?.classList.add('hidden');
    });

    // Mobile Text Send
    const mobileTextarea = document.getElementById('mobile-payload-textarea');
    const mobileSendTextBtn = document.getElementById('btn-mobile-send-text');

    mobileTextarea?.addEventListener('input', () => {
      this.mobileStagedText = mobileTextarea.value.trim() ? mobileTextarea.value : null;
    });

    mobileSendTextBtn?.addEventListener('click', () => {
      if (this.mobileStagedText) {
        this._transmitText(this.mobileStagedText);
        mobileTextarea.value = '';
        this.mobileStagedText = null;
      } else {
        this._showToast('Type something to send', 'error');
      }
    });

    // Mobile File Drop Zone
    const mobileDropZone = document.getElementById('mobile-drop-zone');
    const mobileFileInput = document.getElementById('mobile-file-input');
    const mobileRemoveBtn = document.getElementById('btn-mobile-remove-file');
    const mobileSendFileBtn = document.getElementById('btn-mobile-send-file');

    mobileDropZone?.addEventListener('click', () => mobileFileInput?.click());

    mobileDropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      mobileDropZone.classList.add('drag-active');
    });

    mobileDropZone?.addEventListener('dragleave', () => {
      mobileDropZone.classList.remove('drag-active');
    });

    mobileDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      mobileDropZone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this._selectMobileFile(e.dataTransfer.files[0]);
      }
    });

    mobileFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this._selectMobileFile(e.target.files[0]);
      }
    });

    mobileRemoveBtn?.addEventListener('click', () => {
      this._playSound('click');
      this.mobileStagedFile = null;
      if (mobileFileInput) mobileFileInput.value = '';
      const card = document.getElementById('mobile-staged-file-card');
      card?.classList.add('hidden');
      if (mobileSendFileBtn) mobileSendFileBtn.disabled = true;
    });

    mobileSendFileBtn?.addEventListener('click', () => {
      if (this.mobileStagedFile) {
        this._transmitMobileFile(this.mobileStagedFile);
      }
    });
  }

  /**
   * Stages a file on the mobile side for sending to the laptop.
   * @param {File} file 
   * @private
   */
  _selectMobileFile(file) {
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      this._showToast('File exceeds 50MB maximum limit', 'error');
      return;
    }

    this.mobileStagedFile = file;

    const stagedCard = document.getElementById('mobile-staged-file-card');
    const stagedName = document.getElementById('mobile-staged-name');
    const stagedSize = document.getElementById('mobile-staged-size');
    const sendBtn = document.getElementById('btn-mobile-send-file');
    const preview = document.getElementById('mobile-staged-preview');
    const icon = document.getElementById('mobile-staged-icon');

    if (stagedName) stagedName.textContent = file.name;
    if (stagedSize) stagedSize.textContent = `${formatBytes(file.size)} • ${file.type || 'binary'}`;

    if (file.type && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (preview) {
          preview.src = e.target.result;
          preview.classList.remove('hidden');
        }
        if (icon) icon.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      if (preview) preview.classList.add('hidden');
      if (icon) icon.classList.remove('hidden');
    }

    if (stagedCard) stagedCard.classList.remove('hidden');
    if (sendBtn) sendBtn.disabled = false;

    this._playSound('click');
    this._showToast(`Staged ${file.name} for sending`, 'info');
  }

  /**
   * Transmits a file from mobile to desktop with progress tracking.
   * @param {File} file 
   * @private
   */
  async _transmitMobileFile(file) {
    if (!file) return;

    const progressBox = document.getElementById('mobile-send-progress-box');
    const progressBar = document.getElementById('mobile-send-progress-bar');
    const progressTitle = document.getElementById('mobile-send-title');
    const progressSpeed = document.getElementById('mobile-send-speed');
    const progressBytes = document.getElementById('mobile-send-bytes');

    if (progressBox) progressBox.classList.remove('hidden');
    if (progressTitle) progressTitle.textContent = file.name;

    try {
      await this.streamer.streamFile(file, (sentBytes, totalBytes, percent, speed) => {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressSpeed) progressSpeed.textContent = `${speed} • ${percent}%`;
        if (progressBytes) progressBytes.textContent = `${formatBytes(sentBytes)} / ${formatBytes(totalBytes)}`;
      });
      triggerHaptic();
      this._playSound('success');
      this._showToast(`Sent ${file.name} to laptop`, 'success');

      // Reset progress after completion
      setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
      }, 1500);

      this._addActivityLog({
        type: 'file',
        name: file.name,
        detail: `${formatBytes(file.size)} • sent to laptop`,
        timestamp: Date.now()
      });
    } catch (err) {
      this._showToast(`Send failed: ${err.message}`, 'error');
      if (progressBox) progressBox.classList.add('hidden');
    }
  }

  /**
   * Stages a selected file for transfer and generates thumbnail if image.
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
    const imagePreview = document.getElementById('staged-image-preview');
    const fileIcon = document.getElementById('staged-file-icon');

    if (stagedFileName) stagedFileName.textContent = file.name;
    if (stagedFileSize) stagedFileSize.textContent = `${formatBytes(file.size)} • ${file.type || 'binary'}`;

    // Thumbnail generation if image
    if (file.type && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (imagePreview) {
          imagePreview.src = e.target.result;
          imagePreview.classList.remove('hidden');
        }
        if (fileIcon) fileIcon.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      if (imagePreview) imagePreview.classList.add('hidden');
      if (fileIcon) fileIcon.classList.remove('hidden');
    }

    if (stagedFileCard) stagedFileCard.classList.remove('hidden');
    if (streamFileBtn) streamFileBtn.disabled = false;

    this._playSound('click');
    this._showToast(`Staged ${file.name} in-memory`, 'info');
  }

  /**
   * Renders high-craft toasts with clean typography and borders.
   * @private
   */
  _showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success'
      ? 'bg-[#121215] border-emerald-500/40 text-emerald-300'
      : type === 'error'
      ? 'bg-[#121215] border-rose-500/40 text-rose-300'
      : 'bg-[#121215] border-white/10 text-zinc-200';

    toast.className = `px-3.5 py-2 rounded-lg border shadow-lg text-xs font-medium flex items-center gap-2 transform translate-y-2 opacity-0 transition-all duration-200 pointer-events-auto ${bgClass}`;
    toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const app = new AirQRApp();
  app.boot();
});
