<div align="center">

# ⚡ AirQR

### **Zero-Install, Zero-Cloud-Footprint, Screen-to-Mobile WebRTC Bridge**

An ephemeral, encrypted peer-to-peer data bridge that streams links, raw text, images, and files up to 50MB directly from your desktop screen to your mobile device in-memory via WebRTC.

[![Live Demo](https://img.shields.io/badge/Demo-airqr--cyan.vercel.app-06b6d4?style=for-the-badge&logo=vercel&logoColor=white)](https://airqr-cyan.vercel.app/)
[![Protocol](https://img.shields.io/badge/Transport-WebRTC_DataChannel-10b981?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![STUN](https://img.shields.io/badge/NAT_Traversal-Google_%26_Twilio_STUN-6366f1?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
[![Platforms](https://img.shields.io/badge/Platform-iOS_•_Android_•_macOS_•_Windows_•_Linux-38bdf8?style=for-the-badge)](https://airqr-cyan.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-slate?style=for-the-badge)](LICENSE)

---

[**🌐 Explore Live App**](https://airqr-cyan.vercel.app/) • [**Architecture & Protocol**](#-system-architecture--protocol) • [**Why We Built It**](#-why-we-built-it-the-friction-we-solve) • [**Quickstart**](#-local-development--quickstart) • [**Security Model**](#-zero-trust-security-model)

---

</div>

## 📌 Elevator Pitch

> **No apps. No accounts. No cloud databases.** AirQR turns your desktop screen into an instantaneous, encrypted P2P conduit—allowing any phone camera to scan a high-density QR code, negotiate a direct WebRTC DataChannel, and receive files or clipboard data directly in browser volatile RAM.

---

## 💡 Why We Built It: The Friction We Solve

### The "Self-Chat" Anti-Pattern
Every software engineer, designer, and student has suffered from the broken workflow of moving snippets or assets between desktop and phone:
1. **The Self-Messaging Hack:** Pasting sensitive API keys, OTPs, or private links into a personal WhatsApp or Telegram chat ("Saved Messages") just to open them on mobile.
2. **Ecosystem Walled Gardens:** Apple AirDrop is seamless—until you need to send an APK to an Android test device or beam a PDF from a Linux/Windows workstation to an iPhone.
3. **Cloud Leaks & Storage Debt:** Uploading ephemeral files to Google Drive, Dropbox, or temporary pastebins pollutes cloud buckets, risks credential leaks, and creates unnecessary cloud storage footprints.

### Solution Comparison Matrix

| Capability / Metric | Traditional Cloud Sharing (Drive, Pastebin, Telegram) | Ecosystem Transfer (Apple AirDrop, Quick Share) | ⚡ **AirQR** |
| :--- | :---: | :---: | :---: |
| **Zero Software Installation** | ❌ Requires app / account | ⚠️ OS-restricted proprietary stack | **100% Zero-Install (Standard Web Browser)** |
| **Cross-Platform Compatibility** | ⚠️ Partial (App required) | ❌ Locked to specific OEM ecosystem | **Universal (macOS, Windows, Linux, iOS, Android)** |
| **Server-Side Data Retention** | ❌ Retained indefinitely in cloud | ❌ Metadata / accounts tracked | **Zero Cloud Footprint (100% In-Memory RAM)** |
| **Account / Login Barrier** | ❌ Mandatory authentication | ⚠️ Apple ID / Google account tied | **Zero Sign-Up Required** |
| **Auto-Destruction on Close** | ❌ Manual deletion required | ❌ Local storage persisted | **Immediate Volatile Teardown on Tab Exit** |
| **End-to-End Encryption** | ⚠️ Variable (Provider-dependent) |  Ecosystem-level | **DTLS 1.2/1.3 + SCTP Protocol Level** |

---

## 🏗 System Architecture & Protocol

AirQR avoids centralized databases by leveraging **WebRTC DataChannels** orchestrated through an ephemeral dual-role URL routing pattern:

```
+-----------------------------------------------------------------------------------------------+
|                                      DESKTOP SENDER ( / )                                     |
|  1. Initialize PeerTransportManager with Google & Twilio STUN                                 |
|  2. Generate ephemeral room ID: airqr-9u84e5                                                   |
|  3. Render 512x512 High-DPI Retina QR Matrix (Error Correction: Level H)                      |
|  4. Stage User Payload (URL, Text, or File up to 50MB in volatile memory)                     |
+-----------------------------------------------------------------------------------------------+
                                               │
                                 Mobile Phone Camera Scan
                                               ▼
+-----------------------------------------------------------------------------------------------+
|                                 MOBILE RECEIVER ( /#airqr-9u84e5 )                            |
|  1. Hash inspection: Mounts Receiver Mode lifecycle                                          |
|  2. Connects to signaling server & dispatches connection request to Desktop ID                 |
+-----------------------------------------------------------------------------------------------+
                                               │
                      STUN / NAT Traversal (ICE Candidate Exchange)
                                               ▼
+───────────────────────────────────────────────────────────────────────────────────────────────+
|                      DIRECT PEER-TO-PEER ENCRYPTED WEBRTC DATACHANNEL                         |
|                                                                                               |
|  [Desktop] ─── Frame 1: FILE_START { name, size, mime, totalChunks } ───────► [Mobile]       |
|                                                                                               |
|  [Desktop] ─── Frame 2..N: FILE_CHUNK { index, chunk: 16KB ArrayBuffer } ──► [Mobile]       |
|                                                                                               |
|               ◄── Backpressure Check: bufferedAmount > 64KB (Pause Stream)                    |
|               ◄── Event: bufferedamountlow < 32KB (Resume Stream)                             |
|                                                                                               |
|  [Desktop] ─── Frame End: FILE_END ─────────────────────────────────────────► [Mobile]       |
+───────────────────────────────────────────────────────────────────────────────────────────────+
                                               │
                                       PayloadRenderer
                                               ▼
+-----------------------------------------------------------------------------------------------+
|  1. Reconstruct sequenced ArrayBuffers into unified binary Blob                              |
|  2. Create isolated ObjectURL with programmatic <a download="..."> trigger                   |
|  3. XSS-sanitized inline preview (Image / Monospace Text / PDF viewer)                        |
|  4. Trigger mobile tactile pulse via navigator.vibrate([40, 60, 40])                         |
+-----------------------------------------------------------------------------------------------+
```

---

## 🔬 Engineering Highlights

### 1. 16KB Discrete Binary Chunking & SCTP Flow Control
WebRTC DataChannels operate over **SCTP (Stream Control Transmission Protocol)** wrapped inside DTLS. Pushing large files (e.g., a 45MB video or PDF) in a single chunk crashes mobile browser processes and overwhelms the internal network stack.

AirQR's `BinaryChunkStreamer` slices buffers into exact **16,384-byte (16KB) windows**:
- **Backpressure Watchdog:** Before dispatching each chunk, the streamer evaluates `dataChannel.bufferedAmount`.
- **High-Watermark Guard:** If `bufferedAmount > 65,536` (64KB), the streamer yields execution and waits for the browser's native `bufferedamountlow` event before transmitting subsequent frames.
- **Result:** Smooth 60fps UI performance, zero thread lockup, and reliable streaming across high-latency cellular connections.

### 2. Immediate Auto-State Sync
Users typically drop a file or paste text on desktop *before* picking up their phone to scan. AirQR queues staged items in-memory. The exact instant the mobile peer triggers the `peer_connected` WebRTC handshake, the desktop sender automatically detects the staged payload and fires the binary stream without requiring manual re-clicks.

### 3. High-Density Retina QR Scaling
Mobile camera native barcode scanners often struggle with low-contrast, low-resolution QR codes in dim ambient lighting. AirQR renders a canvas at **512x512 pixels** using **Error Correction Level H (30% recovery)**, scaled down in CSS to a 220px frame. This creates extreme contrast and pixel density, allowing iOS Safari and Android Chrome cameras to lock on instantly from acute angles.

---

## ✨ Features

- 🛡️ **Zero Cloud Storage:** Data lives purely in transient RAM. Once the tab closes, the session and payload cease to exist.
- 📱 **True Platform Independence:** Flawlessly bridges Linux ↔ iOS, Windows ↔ Android, macOS ↔ Android, and vice-versa.
- ⚡ **Auto-State Synchronization:** Stage your payload first, scan second. Data transfers automatically upon connection.
- 📦 **Multi-Payload Detection:**
  - **URLs:** Clean domain parsing card with a 1-tap "Open Link" button.
  - **Code & Text:** Syntax/monospace viewer with line counting and 1-tap clipboard copy.
  - **Images:** Inline previews (PNG, JPG, WebP, GIF, SVG) with direct "Save Image" triggers.
  - **Documents:** PDF and generic binary handling with human-readable byte calculations.
- 📳 **Tactile Haptic Feedback:** Vibrates supported mobile devices (`[40ms, 60ms, 40ms]`) on successful data arrival.
- 🎨 **Sleek Slate-950 Bento Grid:** Designed with custom Tailwind tokens, dark mode contrast, glowing ambient backdrops, and glassmorphism.

---

## 🛠 Tech Stack & Architectural Rationale

| Layer | Technology | Architectural Rationale |
| :--- | :--- | :--- |
| **Frontend Core** | Vanilla ES6+ Modules | Eliminates framework runtime overhead (React/Vue/Next), delivering instant page load and high Lighthouse performance scores. |
| **Styling & Design** | Tailwind CSS (CDN) | High-contrast dark theme (`#090d16`), bespoke Bento grid layout, responsive typography, and mobile-first viewports. |
| **Transport Layer** | WebRTC DataChannel | Enables peer-to-peer data transport with sub-millisecond local network latency, zero intermediate hops, and zero cloud ingress costs. |
| **Peer Signaling** | PeerJS (`1.5.4`) | High-level abstraction for WebRTC connection lifecycles, ICE handshakes, and event-driven DataChannel state tracking. |
| **NAT Traversal** | Google & Twilio Public STUN | Global STUN infrastructure (`stun.l.google.com:19302`, `global.stun.twilio.com:3478`) ensuring high NAT traversal success rates. |
| **QR Engine** | QRCode.js | Generates high-density client-side SVG/Canvas QR matrices with Level H fault tolerance. |
| **Hosting & Edge** | Vercel Edge Network | Static edge deployment guaranteeing low-latency global delivery of static client bundles. |

---

## 🚀 Local Development & Quickstart

### Prerequisites
- Python 3.x, Node.js (`npx serve`), or any static web server.
- Modern desktop and mobile browsers supporting WebRTC.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mahendrapratap23/airqr.git
   cd airqr
   ```

2. **Serve the project locally:**
   Using Python:
   ```bash
   python3 -m http.server 8080
   ```
   Or using Node:
   ```bash
   npx serve -l 8080 .
   ```

3. **Open in your browser:**
   - Desktop Sender: [`http://localhost:8080/`](http://localhost:8080/)
   - Mobile Receiver (Test Tab): [`http://localhost:8080/#airqr-test`](http://localhost:8080/#airqr-test)

> [!IMPORTANT]
> **Mobile Camera & WebRTC Security Note:**  
> Modern mobile browsers (iOS Safari & Android Chrome) restrict camera access and WebRTC capabilities to **Secure Contexts (`https://` or `localhost`)**.  
> If you are testing between two physically separate devices on your local Wi-Fi, expose your local port using an HTTPS tunnel:
> ```bash
> npx localtunnel --port 8080
> # or via Cloudflare Tunnel
> cloudflared tunnel --url http://localhost:8080
> ```

---

## 🔒 Zero-Trust Security Model

1. **Direct In-Memory Volatility:**
   AirQR has no database (PostgreSQL, MongoDB, Redis) and no cloud bucket storage (S3, GCS). All ArrayBuffers are held in browser volatile RAM and released via garbage collection and explicit `URL.revokeObjectURL()` calls.
2. **DTLS 1.2/1.3 Cryptographic Channel:**
   All WebRTC DataChannel frames are encrypted end-to-end using Datagram Transport Layer Security (DTLS). Eavesdroppers on public Wi-Fi networks cannot intercept or inspect payloads in transit.
3. **Strict DOM Sanitization & XSS Defense:**
   Text payloads are safely encoded and rendered using native DOM `textContent` bindings and complete HTML entity escaping (`&`, `<`, `>`, `"`, `'`) to neutralize script execution attacks.
4. **Isolated Ephemeral Sessions:**
   Room identifiers are randomly generated and short-lived. Closing the desktop tab destroys the peer instance, severing signaling and rejecting stale connection attempts.

---

## 👥 Authors & Acknowledgments

Engineered with passion for the **Build with AI Bootcamp** at **Marwadi University**, organized in collaboration with **Google for Developers** and **Hack2skill**.

- **Mahendra Pratap** — *Distributed Systems & Frontend Architecture* ([GitHub](https://github.com/mahendrapratap23))

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
