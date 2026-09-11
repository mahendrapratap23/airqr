# Product Requirements Document (PRD) — AirQR
**Document Version:** 1.0  
**Target Platform:** Modern Web (Desktop & Mobile Chrome/Safari)  
**Execution Model:** Fully Autonomous Antigravity Agent Build  

---

## 1. Objective & Value Proposition
Build **AirQR**: a zero-install, ephemeral screen-to-mobile data transfer bridge.
- **Sender (Desktop):** User drops text, a link, an image, or a file (up to 50MB) and receives an instantaneous dynamic QR code.
- **Receiver (Mobile):** User scans the QR code with their native phone camera to instantly view/download the payload in their mobile browser.
- **Privacy & Infrastructure Core:** Zero cloud storage. Zero backend database. All data is transferred directly in-memory via an encrypted WebRTC DataChannel (PeerJS).

---

## 2. Technical Architecture & Invariant Rules
1. **Zero Monoliths:** Code must be strictly decoupled into:
   - `index.html`: Responsive single-page interface supporting both Desktop and Mobile views.
   - `src/transport/peer_manager.js`: PeerJS connection lifecycle, signaling, and ICE state management.
   - `src/streamer/chunker.js`: 16KB binary slicing, header framing, and backpressure control (`bufferedAmount`).
   - `src/renderers/payload_viewer.js`: Mobile DOM rendering, blob URL reconstruction, auto-sanitization, and action triggers.
   - `app.js`: Main controller wiring DOM events to transport modules based on `window.location.hash`.
2. **Deterministic Dual Routing:**
   - No hash (`/`): Sender Mode. Generates ephemeral peer ID `airqr-[random]`, initializes QR code, listens for incoming receiver connections.
   - With hash (`/#airqr-[id]`): Receiver Mode. Reads room ID from hash, initiates WebRTC connection, listens for incoming payload stream.
3. **Robust Binary Protocol:**
   - Frame 1 (Start Metadata): `{ type: "FILE_START", name: string, size: number, mime: string, totalChunks: number }`
   - Frame 2..N (Chunks): Binary `ArrayBuffer` slice (16,384 bytes) with sequence index.
   - Frame End: `{ type: "FILE_END" }`
   - Backpressure Rule: If `conn.dataChannel.bufferedAmount > 65536` (64KB), pause streaming until `bufferedamountlow` or backoff timer fires.
4. **Resilience & UX:**
   - Visual transfer progress bar (% completed, transferred MB, transfer speed) on both sender and receiver.
   - Auto-trigger `navigator.vibrate([40, 60, 40])` on Android upon successful download.
   - Safe HTML escaping for text payloads to eliminate any XSS vulnerability.

---

## 3. Detailed File Specifications

### File 1: `index.html`
- Uses Tailwind CSS via CDN (`https://cdn.tailwindcss.com`).
- High-contrast dark theme (Background `#090d16`, cards `rgba(17, 24, 39, 0.7)`).
- Desktop Layout: Dual card view (Left: Input tabs for "Text / URL" vs "Files & Images"; Right: High-contrast white QR container, room ID pill, live status indicator).
- Mobile Layout: Single column showing connection state, incoming progress bar, inline preview (embedded image/document iframe or pre-formatted code block), and sticky download/copy buttons.

### File 2: `src/transport/peer_manager.js`
- Exports class `PeerTransportManager`.
- Configures PeerJS with Google and Twilio public STUN servers:
  - `stun:stun.l.google.com:19302`
  - `stun:global.stun.twilio.com:3478`
- Emits custom typed events: `peer_ready`, `peer_connected`, `peer_disconnected`, `transfer_error`.

### File 3: `src/streamer/chunker.js`
- Exports `BinaryChunkStreamer` and `BinaryChunkAssembler`.
- Handles reading `File` or `Blob` via `FileReader` in discrete 16KB windows.
- Dispatches progress callbacks: `(transferredBytes, totalBytes, percent) => void`.

### File 4: `src/renderers/payload_viewer.js`
- Exports `renderMobilePayload(payload, containerEl, actionEl)`.
- Implements:
  - URLs: Renders clickable card with "Open Link" primary button.
  - Text: Sanitized monospace card with one-click "Copy to Clipboard" and haptic pulse.
  - Images: Responsive `<img>` preview with "Save Image" anchor trigger.
  - PDFs/Files: Icon + metadata pill with a programmatic `<a download="...">` trigger.

### File 5: `app.js`
- Imports modules and binds DOM events (`dragover`, `drop`, `input`, tab changes).

---

## 4. Verification & Testing Requirements
The agent must verify functionality by running a local HTTP server and testing:
1. `python3 -m http.server 8080` (or `npx serve .`)
2. Sender view mounts cleanly at `http://localhost:8080` with a valid QR canvas.
3. Visiting `http://localhost:8080/#airqr-test` mounts the Receiver interface.
4. Sending a synthetic 5MB binary blob completes transfer without exceeding backpressure limits.
