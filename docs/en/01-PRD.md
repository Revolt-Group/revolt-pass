# Product Requirements Document (PRD)
## Project: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadata | Detail |
| :--- | :--- |
| **Document Identifier** | `RP-PRD-001` |
| **Version** | `1.0.0-PROD` |
| **Status** | Approved / Canonical Specification |
| **Organization** | Revolt Group |
| **Production Domain** | `https://<your-domain-or-subdomain>.workers.dev` |
| **Git Repository** | `https://github.com/Revolt-Group/revolt-pass.git` |
| **Primary Branch** | `main` |
| **License / Distribution** | Open Source (MIT) |

---

## 1. Executive Summary and Problem Statement

### 1.1 Executive Summary
**Revolt Pass** is an enterprise-grade Progressive Web App (PWA) designed under a **Zero-Knowledge** cryptographic architecture. Its primary objective is to operate as a secure, sovereign, and highly available vault for managing two-factor authentication factors (TOTP - RFC 6238), structured storage of recovery codes, and future expansion into a comprehensive credential manager.

The system runs on the client (browser/device) leveraging native hardware **Web Crypto API** and synchronizes bidirectionally against a Serverless Edge infrastructure on **Cloudflare Workers** backed by the **Cloudflare D1** distributed relational database, operating strictly within the limits of Cloudflare's free tier without incurring fixed operational costs.

### 1.2 Problem Statement
1. **Systemic Risk of Centralized Managers:** Recurrent industry incidents (e.g., massive breaches in proprietary commercial providers) highlight the danger of trusting cryptographic secrets and vaults to servers that process or store metadata and credentials in plaintext or with third-party-managed keys.
2. **Operational Friction on Workstations (Desktop / Windows):** Engineers and operators working in desktop environments often lack fingerprint biometric sensors, degrading user experience or forcing them to rely on mobile phones to retrieve 6-digit codes. Supporting native authentication via **Windows Hello (through secure PIN or biometrics)** via the FIDO2 / WebAuthn standard is imperative, matching Touch ID / Face ID in mobile ecosystems.
3. **Critical Loss of Recovery Codes:** Most 2FA apps on the market treat single-use recovery codes as unstructured notes or loose text files, leading to account lockouts in emergencies and operational disasters.
4. **Time Drift:** Small discrepancies between the client device clock and identity provider (IdP) clocks cause sporadic and inexplicable rejections of valid TOTP tokens.
5. **Local Surface Vulnerabilities:** Inadvertent persistence in the operating system clipboard (*clipboard sniffing*) and data exposure in RAM after prolonged screen inactivity.

---

## 2. System Purpose and Guiding Principles

The design and development of Revolt Pass is strictly governed by five engineering principles:

1. **Absolute Zero-Knowledge (Client-Side Cryptography):** Remote infrastructure (Cloudflare Edge and D1) is treated as an untrusted channel (*untrusted storage*). The server **only stores encrypted binary blobs** using `AES-GCM-256`, an initialization vector (`IV`), and synchronization metadata. Master keys never leave the client's volatile RAM.
2. **Native Offline-First:** The user must be able to authenticate, query, generate, and copy TOTP codes in 100% of cases, regardless of Internet connectivity. Synchronization is a background service that reconciles asynchronous states.
3. **Fortune 500-Grade Ergonomics:** Minimalist, Dark-Mode First interface with zero perceived latency (<16ms per frame), fluid keyboard navigation (Command Palette `Ctrl + K`), QR code drag-and-drop support, and haptic feedback.
4. **Data Sovereignty and Portability:** The user is the sole owner of their data. The system provides transparent export and import mechanisms in open standard formats (encrypted JSON and plaintext JSON under explicit warning).
5. **Resource Efficiency:** Exhaustive optimization to permanently remain within Cloudflare's free tier (CPU time <10ms per request, database size <5GB, reads/writes minimized by design).

---

## 3. Product Scope Management

### 3.1 In-Scope (Committed Scope for MVP v1.0)
* **TOTP Cryptographic Engine:** Full RFC 6238 support with HMAC-SHA1 and HMAC-SHA256, configurable digits (6 or 8), rotation intervals (default 30s), and pure RFC 4648 Base32 decoder without deprecated external dependencies.
* **Symmetric Encryption and KDF:** Key derivation via PBKDF2-SHA256 (600,000 iterations recommended by OWASP) and authenticated encryption of the entire vault via AES-256-GCM.
* **Biometric / Platform Authentication (WebAuthn / FIDO2):**
  * Native support for **Windows Hello** (using Windows PIN on machines without fingerprint readers).
  * Support for **Mobile Biometrics** (Touch ID, Face ID, Android fingerprint biometrics).
  * Local wrapping of the decryption key stored in IndexedDB to provide "Quick Unlock" functionality.
* **Integrated Management of Recovery Codes:**
  * Structured storage in each account (`code`, `used: boolean`).
  * Collapsible interface with default masking.
  * Visual marking of burned/used codes with a single click.
  * Fast individual clipboard copy.
* **Flexible 2FA Secret Ingestion:**
  * Dynamic scanning via webcam or mobile camera.
  * Interactive Dropzone area to drop screenshots containing QR codes.
  * Direct clipboard paste (`Ctrl + V`) of QR code images.
  * Manual form with strict Base32 sanitization and validation.
* **Time Drift Compensation:**
  * Millimetric synchronization against the UTC timestamp issued by the Cloudflare Worker.
  * Dynamic time delta calculation applied to the TOTP generation formula.
* **Memory and Surface Protection:**
  * Configurable auto-lock on inactivity (default 5 minutes, options: 1, 3, 5, 15 min).
  * Forced RAM purge on prolonged `visibilitychange` event or tab closure.
  * Clipboard auto-clear after 45 seconds with integrity verification.
* **Productivity & UI:**
  * Command Palette (`Ctrl + K` / `Cmd + K`) for quick filtering and copying.
  * Priority pinned accounts (`pinned`).
  * Automatic detection and dynamic loading of official logos via **Simple Icons CDN** with fallback to deterministic gradient monogram avatars.
  * Integrated cryptographic strong password generator (`crypto.getRandomValues`).
  * Haptic feedback (`navigator.vibrate`) on touch devices.
* **PWA & Offline:**
  * Service Worker with Workbox configured for aggressive caching of static assets.
  * Local storage via IndexedDB (`idb`).
  * Complete web manifest installable on Windows, macOS, iOS, and Android.
* **Cloudflare Synchronization:**
  * REST endpoints on Cloudflare Workers with persistence in Cloudflare D1.
  * Optimistic concurrency resolution model with version-based conflict detection.

### 3.2 Out-of-Scope (Deferred to Later Versions v2.0+)
* Shared multi-family or enterprise multi-user vaults (the MVP is sovereign single-user per instance).
* Browser extension for Chromium/Firefox with script injection into third-party pages.
* Real-time HaveIBeenPwned (HIBP) API integration for bulk password auditing.
* Proprietary U2F hardware token support not implementing standard FIDO2/WebAuthn layers.

---

## 4. Detailed Functional Requirements

### FR-01: TOTP Calculation Engine (RFC 6238)
* **FR-01.1:** The system must calculate the time-step counter $T$ as:
  $$T = \lfloor \frac{T_{local} + \Delta T_{drift} - T_0}{T_x} \rfloor$$
  where $T_0 = 0$, $T_x = \text{period (default 30)}$, and $\Delta T_{drift}$ is the offset in seconds relative to the server.
* **FR-01.2:** Secret decoding must be performed from canonical Base32 (RFC 4648, alphabet `A-Z`, `2-7`), stripping whitespace and dashes automatically.
* **FR-01.3:** Must support cryptographic algorithms `HMAC-SHA1` (default for global compatibility) and `HMAC-SHA256`.
* **FR-01.4:** The interface must render a circular SVG progress indicator updating at 60 FPS or 1-second resolution, visually warning in amber/red during the last 5 seconds of the cycle.
* **FR-01.5:** Must proactively pre-calculate the next cycle's code to ensure instant transitions without rendering latency.

### FR-02: Structured Management of Recovery Codes
* **FR-02.1:** Each vault record (`VaultItem`) may contain an optional array of objects `{ code: string, used: boolean }`.
* **FR-02.2:** For operational security reasons, codes must be displayed masked (`••••••••••`) in the general view and only revealed on user demand via a toggle button.
* **FR-02.3:** The user can mark or unmark a code as "used", which applies a strikethrough disabled style, immediately persisting the change in the local vault and scheduling remote synchronization.
* **FR-02.4:** Clicking an individual recovery code must copy it to the clipboard, trigger the auto-clean timer (FR-07), and issue haptic/visual feedback.

### FR-03: Key Derivation and Zero-Knowledge Encryption
* **FR-03.1:** The user defines a high-entropy Master Password.
* **FR-03.2:** The system generates a cryptographically secure `kdf_salt` of at least 16 bytes (128 bits) using `crypto.getRandomValues`.
* **FR-03.3:** The symmetric encryption key is derived exclusively on the client using **PBKDF2 with HMAC-SHA256**, applying **600,000 iterations**.
* **FR-03.4:** The entire vault payload (all `VaultItem` serialized in JSON) is encrypted using **256-bit AES-GCM** with a unique random 12-byte initialization vector (`IV`) for each save operation.
* **FR-03.5:** Storing the master password or derived key in plaintext in any persistent storage mechanism (`localStorage`, `sessionStorage`, `IndexedDB`, `cookies`) is strictly forbidden.

### FR-04: Quick Unlock via WebAuthn / Passkeys
* **FR-04.1:** After the first successful unlock with the Master Password, the user can enroll their device in **WebAuthn / FIDO2**.
* **FR-04.2:** On Windows workstations, the system uses the integrated platform authenticator (**Windows Hello**), allowing unlock via **numeric PIN or biometrics**.
* **FR-04.3:** On mobile devices (Android/iOS) and macOS, it uses the native biometric sensor (Touch ID, Face ID, or Android fingerprint sensor).
* **FR-04.4:** Wrapping mechanism: The vault derived key is encrypted using a local key generated for WebAuthn and stored protected in IndexedDB. Accessing this wrapped key requires successful user verification (`userVerification: "required"`).
* **FR-04.5:** If the user resets the browser or the biometric session fails 3 times, the system immediately reverts to prompting for the full Master Password.

### FR-05: Account Ingestion and QR Scanner
* **FR-05.1:** Must parse standard authentication URIs:
  `otpauth://totp/[Issuer:]Account?secret=SECRET&issuer=Issuer&algorithm=SHA1&digits=6&period=30`
* **FR-05.2:** Live scanning module using webcam or smartphone camera with front/rear camera toggle.
* **FR-05.3:** Dropzone module allowing image files (`.png`, `.jpg`, `.jpeg`, `.webp`) to be dropped.
* **FR-05.4:** Global `paste` (`Ctrl + V`) event interceptor that captures images from the clipboard, processes the bitmap via QR decoder, and extracts the URI without saving temporary files to disk.
* **FR-05.5:** Manual form for account creation and editing with real-time validation.

### FR-06: Time Drift Compensation
* **FR-06.1:** When initializing the PWA and upon each network reconnection, the application queries the lightweight endpoint `GET /api/time`.
* **FR-06.2:** The client measures the round-trip time (RTT) to calculate the exact offset:
  $$\Delta t = T_{server} - \left( T_{req\_start} + \frac{RTT}{2} \right)$$
* **FR-06.3:** The delta is kept in memory and transparently added to the client local clock in each TOTP calculation.

### FR-07: Memory and Clipboard Hygiene
* **FR-07.1 Inactivity Auto-Lock:** A configurable timer purges the cryptographic key from RAM and returns the interface to the lock screen after the set period without user interaction.
* **FR-07.2 Background Auto-Lock:** If the tab or PWA window is moved to the background (`document.visibilityState === 'hidden'`) for more than 10 minutes, the system forces preventive locking.
* **FR-07.3 Clipboard Clearing:** When copying a TOTP or recovery code, a 45-second countdown starts. When expired:
  * If the current clipboard content matches the copied secret, it is overwritten with an empty string or spaces.
  * If the user copied other external content in the interim, overwriting is aborted to avoid destroying external data.

### FR-08: Command Palette and Fast Search
* **FR-08.1:** Universally accessible via keyboard shortcut `Ctrl + K` (Windows/Linux) or `Cmd + K` (macOS).
* **FR-08.2:** Instant filtering by `issuer`, `account`, or `tags` with typo tolerance (*fuzzy search*).
* **FR-08.3:** Directional arrow navigation (`ArrowUp`, `ArrowDown`) and `Enter` selection to immediately copy the TOTP code and close the modal.

### FR-09: Visual Identity and Simple Icons CDN
* **FR-09.1:** Normalization of the `issuer` field (e.g., "Google LLC" $\to$ "google", "GitHub, Inc." $\to$ "github").
* **FR-09.2:** Invocations to Simple Icons CDN: `https://cdn.simpleicons.org/{slug}`.
* **FR-09.3:** In case of HTTP 404 error or network failure, render a vector avatar with account initials over a color gradient derived from the FNV-1a hash of the provider name.

### FR-10: Cryptographic Password Generator
* **FR-10.1:** Generator integrated in dedicated modal and account editing view.
* **FR-10.2:** Generation exclusively via `crypto.getRandomValues(new Uint32Array(n))`.
* **FR-10.3:** Controls for length (8 to 64 characters) and character sets: uppercase, lowercase, digits, and unambiguous special symbols.
* **FR-10.4:** Real-time calculation and visualization of theoretical entropy in bits ($E = L \cdot \log_2(N)$).

### FR-11: Bidirectional Remote Synchronization
* **FR-11.1:** Persistence of local version in IndexedDB.
* **FR-11.2:** Upon detecting connection or saving local changes, a transaction executes against `PUT /api/vault`.
* **FR-11.3:** Optimistic concurrency control via monotonically increasing `version` field. If the server has a higher version, it returns `409 Conflict`, triggering the reconciliation protocol.

### FR-12: Backup, Export, and Import
* **FR-12.1:** **Encrypted Export (Recommended):** Download of a `.revolt.enc.json` file containing the blob encrypted with the master password and KDF metadata, ensuring secure portability.
* **FR-12.2:** **Plaintext Export (Emergency):** Download of a JSON file with decrypted secrets. Requires mandatory entry of the Master Password and confirmation via a critical destructive warning modal.
* **FR-12.3:** **Import:** Loading and structural validation against the canonical TypeScript schema (`VaultItem[]`). If mandatory fields are missing, the process is safely aborted without corrupting the existing database.

---

## 5. Non-Functional Requirements (NFR)

### NFR-01: Performance and Latency
* **TOTP Code Computation:** Execution time under **5 milliseconds** on any modern CPU.
* **KDF Derivation (PBKDF2 600k):** Derivation time under **800 milliseconds** on standard desktop hardware. To avoid freezing user interface frame rates (FPS), heavy derivation must execute in a dedicated **Web Worker**.
* **Startup Time (First Contentful Paint):** Under **1.2 seconds** on simulated 3G connections due to Service Worker precached assets.

### NFR-02: Availability and Offline Mode
* 100% of account viewing, TOTP code calculation, clipboard copying, and recovery code reading functions must be guaranteed without Internet access.
* Local modifications made while offline must be stored with a `pending_sync` status flag and automatically dispatched when connectivity is restored (`navigator.onLine`).

### NFR-03: Cloudflare Free Tier Governance
The system must operate comfortably within Cloudflare's strict free tier limits:
* **Cloudflare Workers:** 100,000 daily requests limit and 10 milliseconds CPU time per request. Data compression and Zero-Knowledge architecture guarantee CPU times under 2 milliseconds per invocation.
* **Cloudflare D1:** 5,000,000 daily reads, 100,000 daily writes, and 5 GB total storage. Given a typical vault is under 500 KB, storage consumption represents <0.01% of available quota.

### NFR-04: Security and Confidentiality
* **Zero-Trust Architecture:** Neither infrastructure operators, Cloudflare administrators, nor attackers compromising the D1 database can decrypt vault secrets without possessing the Master Password.
* **Encryption in Transit:** Forced TLS 1.3 link across Cloudflare edge network with strict HSTS (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).
* **Content Security Policy (CSP):** Restrictive directives preventing external script injection, limiting outbound connections solely to own domain and Simple Icons CDN.

### NFR-05: Usability and Accessibility
* Strict compliance with **WCAG 2.1 Level AA** standard.
* Color contrast ratios exceeding 4.5:1 for text elements and interactive controls against dark backgrounds.
* 100% keyboard-assisted navigability for users with reduced mobility or advanced desktop users.

### NFR-06: Cross-Platform Compatibility
* **Desktop Browsers:** Google Chrome 120+, Microsoft Edge 120+, Mozilla Firefox 120+, Safari 17+.
* **Mobile Environments:** Chrome for Android (recent version with WebAuthn support), Safari on iOS 17+.
* **Operating Systems:** Windows 10/11 (full Windows Hello with PIN support), macOS Sonoma/Sequoia, Linux (Ubuntu/Fedora with Chromium/Firefox), Android 13+, iOS 17+.

---

## 6. Product Success Metrics (Engineering KPIs)

| Metric | Committed Target | Measurement Method |
| :--- | :--- | :--- |
| **Quick Unlock Time** | $< 400 \text{ ms}$ | Client telemetry (`performance.measure`) |
| **Offline Success Rate** | $100\%$ | Validation via network cutoff in DevTools |
| **Worker CPU Consumption** | $< 3.5 \text{ ms}$ | Cloudflare Worker Analytics |
| **Time Drift Precision** | $\pm 50 \text{ ms}$ maximum error | Comparison vs adjusted `Date.now()` |
| **Initial Bundle Size (Gzipped)** | $< 180 \text{ KB}$ | Vite build report & Rollup visualizer |
