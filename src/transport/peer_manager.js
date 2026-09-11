/**
 * AirQR — Peer Transport Layer
 * Encapsulates PeerJS lifecycle, STUN configuration, and typed WebRTC DataChannel events.
 * Path: src/transport/peer_manager.js
 */

export class PeerTransportManager extends EventTarget {
  constructor(options = {}) {
    super();
    this.peer = null;
    this.activeConnection = null;
    this.currentRoomId = null;
    this.isSender = false;
    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ];
  }

  /**
   * Initializes this instance as the Desktop Sender.
   * Listens for an incoming connection from the mobile scanner.
   * @param {string} roomId 
   */
  initSender(roomId) {
    this.isSender = true;
    this.currentRoomId = roomId;
    this._teardown();

    try {
      this.peer = new window.Peer(roomId, {
        debug: 1,
        config: {
          iceServers: this.iceServers
        }
      });

      this.peer.on('open', (id) => {
        this.currentRoomId = id;
        this._emit('peer_ready', { role: 'sender', roomId: id });
      });

      this.peer.on('connection', (conn) => {
        if (this.activeConnection) {
          this.activeConnection.close();
        }
        this._bindConnection(conn);
      });

      this.peer.on('error', (err) => {
        this._handlePeerError(err);
      });

      this.peer.on('disconnected', () => {
        this._emit('peer_disconnected', { message: 'Signaling server disconnected. Attempting reconnect...' });
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    } catch (err) {
      this._emit('transfer_error', { error: `Failed to initialize WebRTC engine: ${err.message}` });
    }
  }

  /**
   * Connects to a target Desktop Sender as the Mobile Receiver.
   * @param {string} targetRoomId 
   */
  connectToPeer(targetRoomId) {
    this.isSender = false;
    this.currentRoomId = targetRoomId;
    this._teardown();

    try {
      this.peer = new window.Peer({
        debug: 1,
        config: {
          iceServers: this.iceServers
        }
      });

      this.peer.on('open', () => {
        const conn = this.peer.connect(targetRoomId, {
          reliable: true,
          serialization: 'binary'
        });
        this._bindConnection(conn);
      });

      this.peer.on('error', (err) => {
        this._handlePeerError(err);
      });

      this.peer.on('disconnected', () => {
        this._emit('peer_disconnected', { message: 'Signaling lost. Reconnecting...' });
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });
    } catch (err) {
      this._emit('transfer_error', { error: `Receiver initialization failed: ${err.message}` });
    }
  }

  /**
   * Binds WebRTC DataConnection events and pipes incoming data frames.
   * @private
   */
  _bindConnection(conn) {
    this.activeConnection = conn;

    conn.on('open', () => {
      this._emit('peer_connected', {
        peerId: conn.peer,
        role: this.isSender ? 'sender' : 'receiver',
        connection: conn
      });
    });

    conn.on('data', (data) => {
      this._emit('data_received', { data });
    });

    conn.on('close', () => {
      this.activeConnection = null;
      this._emit('peer_disconnected', { message: 'Peer connection closed' });
    });

    conn.on('error', (err) => {
      this._emit('transfer_error', { error: `DataChannel error: ${err.message || 'Stream disrupted'}` });
    });
  }

  /**
   * Dispatches typed custom events with payloads on the EventTarget.
   * @private
   */
  _emit(eventType, detail) {
    this.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  /**
   * Translates PeerJS internal error codes into descriptive user-facing errors.
   * @private
   */
  _handlePeerError(err) {
    let friendlyMessage = err.message || 'Unknown WebRTC error';

    if (err.type === 'peer-unavailable') {
      friendlyMessage = 'Desktop room not found. Ensure desktop tab is active.';
    } else if (err.type === 'unavailable-id') {
      friendlyMessage = 'Room ID occupied. Generating new session...';
      if (this.isSender) {
        const randomHex = Math.random().toString(36).substring(2, 8);
        this.initSender(`airqr-${randomHex}`);
        return;
      }
    } else if (err.type === 'network' || err.type === 'server-error') {
      friendlyMessage = 'STUN signaling unreachable. Check your internet connection.';
    }

    this._emit('transfer_error', { error: friendlyMessage, rawError: err });
  }

  /**
   * Sends structured JSON or binary ArrayBuffer down the active WebRTC DataChannel.
   * @param {any} data 
   */
  send(data) {
    if (!this.activeConnection || !this.activeConnection.open) {
      throw new Error('WebRTC DataChannel is not open');
    }
    this.activeConnection.send(data);
  }

  getConnection() {
    return this.activeConnection;
  }

  getDataChannel() {
    return this.activeConnection ? this.activeConnection.dataChannel : null;
  }

  destroy() {
    this._teardown();
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
}
