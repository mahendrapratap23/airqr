/**
 * AirQR — Binary Chunker & Flow Controller
 * 16KB discrete slicing, protocol framing, and SCTP backpressure management.
 * Path: src/streamer/chunker.js
 */

export const CHUNK_SIZE = 16 * 1024; // 16,384 bytes per WebRTC frame
export const BUFFERED_AMOUNT_HIGH_WATERMARK = 65536; // 64KB backpressure threshold
export const BUFFERED_AMOUNT_LOW_WATERMARK = 32768; // 32KB resume threshold

/**
 * Streams files in discrete 16KB chunks over WebRTC DataChannel with backpressure flow control.
 */
export class BinaryChunkStreamer {
  constructor(peerManager) {
    this.peerManager = peerManager;
    this.isStreaming = false;
  }

  /**
   * Reads a File or Blob in 16KB windows and streams it sequentially.
   * @param {File|Blob} file 
   * @param {Function} onProgress (transferredBytes, totalBytes, percent, speedStr) => void
   * @returns {Promise<void>}
   */
  async streamFile(file, onProgress) {
    if (this.isStreaming) {
      throw new Error('A file stream is already in progress');
    }

    this.isStreaming = true;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const startTime = Date.now();

    try {
      // 1. Dispatch Frame 1: FILE_START metadata
      this.peerManager.send({
        type: 'FILE_START',
        name: file.name || 'payload.bin',
        size: file.size,
        mime: file.type || 'application/octet-stream',
        totalChunks: totalChunks
      });

      // 2. Stream 16KB Slices with Backpressure Monitoring
      for (let i = 0; i < totalChunks; i++) {
        // Enforce backpressure check: pause if bufferedAmount > 64KB
        await this._applyBackpressure();

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const slice = file.slice(start, end);

        // Read window via FileReader
        const chunkBuffer = await this._readSliceAsArrayBuffer(slice);

        // Dispatch Frame 2..N: FILE_CHUNK
        this.peerManager.send({
          type: 'FILE_CHUNK',
          index: i,
          totalChunks: totalChunks,
          chunk: chunkBuffer
        });

        // Compute transfer speed & percent
        const transferredBytes = end;
        const percent = Math.round((transferredBytes / file.size) * 100);
        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.001);
        const speedBytesPerSec = transferredBytes / elapsedSec;
        const speedStr = this._formatBytes(speedBytesPerSec) + '/s';

        if (typeof onProgress === 'function') {
          onProgress(transferredBytes, file.size, percent, speedStr);
        }
      }

      // 3. Dispatch Frame End: FILE_END
      this.peerManager.send({
        type: 'FILE_END'
      });

    } finally {
      this.isStreaming = false;
    }
  }

  /**
   * Reads a Blob slice into an ArrayBuffer via blob.arrayBuffer() or FileReader fallback.
   * @private
   */
  async _readSliceAsArrayBuffer(blobSlice) {
    if (typeof blobSlice.arrayBuffer === 'function') {
      return await blobSlice.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        reject(new Error('FileReader is not defined in this environment'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed to read chunk'));
      reader.readAsArrayBuffer(blobSlice);
    });
  }

  /**
   * Backpressure rule: Pauses stream when dataChannel.bufferedAmount > 65536.
   * Resumes when 'bufferedamountlow' fires or watchdog timer expires.
   * @private
   */
  async _applyBackpressure() {
    const dataChannel = this.peerManager.getDataChannel();
    if (!dataChannel) return;

    if (dataChannel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATERMARK) {
      await new Promise((resolve) => {
        let watchdog;
        const handleLow = () => {
          clearTimeout(watchdog);
          dataChannel.removeEventListener('bufferedamountlow', handleLow);
          resolve();
        };

        dataChannel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_WATERMARK;
        dataChannel.addEventListener('bufferedamountlow', handleLow);

        // Safety watchdog: ensure stream does not stall indefinitely if event drops
        watchdog = setTimeout(() => {
          dataChannel.removeEventListener('bufferedamountlow', handleLow);
          resolve();
        }, 120);
      });
    }
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

/**
 * Reassembles incoming binary frames into a cohesive Blob with progress tracking.
 */
export class BinaryChunkAssembler {
  constructor() {
    this.currentTransfer = null;
  }

  /**
   * Processes incoming data frames from the transport layer.
   * @param {Object} frame 
   * @param {Function} onProgress (transferredBytes, totalBytes, percent, speedStr) => void
   * @param {Function} onComplete (filePayload) => void
   */
  handleFrame(frame, onProgress, onComplete) {
    if (!frame || !frame.type) return;

    if (frame.type === 'FILE_START') {
      this.currentTransfer = {
        name: frame.name,
        size: frame.size,
        mime: frame.mime,
        totalChunks: frame.totalChunks,
        chunks: new Array(frame.totalChunks),
        receivedBytes: 0,
        startTime: Date.now()
      };
      if (typeof onProgress === 'function') {
        onProgress(0, frame.size, 0, '0 KB/s', frame.name);
      }
    } else if (frame.type === 'FILE_CHUNK') {
      if (!this.currentTransfer) return;

      this.currentTransfer.chunks[frame.index] = frame.chunk;
      const chunkSize = frame.chunk ? frame.chunk.byteLength : 0;
      this.currentTransfer.receivedBytes += chunkSize;

      const elapsedSec = Math.max((Date.now() - this.currentTransfer.startTime) / 1000, 0.001);
      const speedBytesPerSec = this.currentTransfer.receivedBytes / elapsedSec;
      const percent = Math.round((this.currentTransfer.receivedBytes / this.currentTransfer.size) * 100);
      const speedStr = this._formatBytes(speedBytesPerSec) + '/s';

      if (typeof onProgress === 'function') {
        onProgress(this.currentTransfer.receivedBytes, this.currentTransfer.size, percent, speedStr, this.currentTransfer.name);
      }
    } else if (frame.type === 'FILE_END') {
      if (!this.currentTransfer) return;

      const assembledBlob = new Blob(this.currentTransfer.chunks, {
        type: this.currentTransfer.mime || 'application/octet-stream'
      });

      const filePayload = {
        type: 'file',
        name: this.currentTransfer.name,
        size: this.currentTransfer.size,
        mime: this.currentTransfer.mime,
        blob: assembledBlob,
        timestamp: Date.now()
      };

      const completedTransfer = this.currentTransfer;
      this.currentTransfer = null;

      if (typeof onComplete === 'function') {
        onComplete(filePayload, completedTransfer);
      }
    }
  }

  isReceiving() {
    return this.currentTransfer !== null;
  }

  getCurrentFile() {
    return this.currentTransfer;
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
