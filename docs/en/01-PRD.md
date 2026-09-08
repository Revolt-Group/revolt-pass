# Product Requirements Document (PRD)
## Project: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadata | Detail |
| :--- | :--- |
| **Document Identifier** | `RP-PRD-001` |
| **Version** | `2.0.0-PROD (v2.5 Scope Ready)` |
| **Status** | Approved / Canonical Specification |
| **Organization** | Revolt Group |
| **Production Domain** | `https://<your-domain-or-subdomain>.workers.dev` |
| **Git Repository** | `https://github.com/Revolt-Group/revolt-pass.git` |
| **Primary Branch** | `main` |
| **License / Distribution** | Free & Open Source Copyleft (GNU AGPLv3) + Trademark Policy |

---

## 1. Executive Summary and Problem Statement

### 1.1 Executive Summary
**Revolt Pass** is an enterprise-grade Progressive Web App (PWA) designed under a **Zero-Knowledge** cryptographic architecture. Its primary objective is to operate as a secure, sovereign, and highly available vault for the comprehensive management of two-factor authentication factors (TOTP - RFC 6238), passwords and logins (with CSPRNG generator, website URLs, embedded 2FA, and password history), payment credit/debit cards, encrypted Markdown secure notes, server/SSH infrastructure keys, personal identity profiles, and structured recovery codes.

The system features per-item envelope encryption (`item_key`), automatic historical rolling snapshots in **Cloudflare D1** with optimistic rollback, a 30-day trash bin with cryptographic auto-purge, and 100% offline generation of a printable physical Emergency Kit. It executes strictly on the client (browser/device) leveraging native hardware **Web Crypto API** and memory-hard key derivation via **Argon2id WASM (64 MB)**, synchronizing bidirectionally against a Serverless Edge infrastructure on **Cloudflare Workers** backed by the **Cloudflare D1** distributed relational database, operating strictly within Cloudflare's free tier without incurring fixed operational costs ($0 USD/month).

### 1.2 Problem Statement
1. **Systemic Risk of Centralized Managers:** Recurrent industry incidents (e.g., massive breaches in proprietary commercial providers) highlight the danger of trusting cryptographic secrets and vaults to servers that process or store metadata and credentials in plaintext or with third-party-managed keys.
2. **Operational Friction on Desktop Workstations (Windows):** Engineers working on desktop workstations frequently lack fingerprint scanners, forcing them to use mobile devices for 6-digit codes. Supporting native **Windows Hello (via secure PIN or biometrics)** via FIDO2 / WebAuthn is critical.
3. **Critical Loss of Recovery Codes:** Most 2FA apps treat one-time recovery codes as unstructured notes or loose text files, leading to permanent account lockouts during emergencies.
4. **Time Drift:** Discrepancies between client clocks and identity providers (IdP) cause intermittent rejection of valid TOTP tokens.
5. **Local Attack Surface:** Inadvertent OS clipboard persistence (*clipboard sniffing*) and RAM exposure after extended periods of inactivity.

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

### 3.1 In-Scope (Committed and Implemented Scope v1.0 — v2.0.0)
* **Polymorphic Secrets Suite (v2.0.0):** Full canonical support for 6 secret types: `totp`, `login` (with username, password, CSPRNG generator, URLs, embedded 2FA token, and chronological password history), `card` (card number, cardholder, expiration, CVV/PIN with automatic brand detection), `note` (secure Markdown), `server_key` (host, port, username, public key, private key, and passphrase), and `identity` (titles, names, IDs/passports, emails, phone numbers, and addresses).
* **Per-Item Envelope Encryption (`item_key`):** Each item holds an independent 32-byte AES-256 symmetric key wrapped under the master key, guaranteeing granular secret isolation and readiness for asymmetric sharing (v2.5).
* **30-Day Trash Bin with Cryptographic Auto-Purge:** Soft deletion with `deleted_at` timestamp, countdown display, 1-click restore, and automated permanent destruction after 30 days leaving zero residual leakage in the ciphertext.
* **Historical Snapshots in Cloudflare D1 & Optimistic Rollback:** Transactional archiving of the last 5 vault versions in the D1 `vault_snapshots` table. 1-click restoration via `POST /api/vault/restore/:vault_version` assigning `version = current.version + 1` to preserve optimistic concurrency control consistency.
* **Printable Physical Emergency Kit:** 100% client-side offline vector SVG recovery sheet generator featuring the encrypted vault payload QR code and handwritten master password box without external network requests (`window.print()`).
* **TOTP Cryptographic Engine:** Full RFC 6238 support with HMAC-SHA1 and HMAC-SHA256, configurable digits (6 or 8), rotation intervals (default 30s), and pure RFC 4648 Base32 decoder without deprecated external dependencies.
* **Symmetric Encryption and KDF:** Key derivation via **Argon2id (64 MB RAM, 3 rounds recommended by OWASP 2024)** with backward support and transparent auto-upgrade for legacy **PBKDF2-SHA256 (600,000 iterations)**, and authenticated encryption of the entire vault via AES-256-GCM.
* **Proactive Zero-Knowledge Alerts:** Real-time native push notifications via Web Push (RFC 8291/8292 with VAPID) and BYOK email alerts (Resend / Cloudflare).
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
* Shared multi-family vaults or corporate LDAP/SSO directories (deferred to v3.0+; asymmetric zero-knowledge item sharing between accounts is formally scheduled for **Milestone v2.5** under ECDH P-384 / ADR-014).
* Browser extension for Chromium/Firefox with script injection into third-party pages (scheduled for **Milestone v2.1**).
* Native compiled desktop application with direct OS hardware security integration in Rust (scheduled for **Milestone v2.2**).
* Terminal CLI tool (`rpctl`) with process memory secret injection (scheduled for **Milestone v2.3**).
* Duress password and decoy vault (scheduled for **Milestone v2.4**).
* Real-time HaveIBeenPwned (HIBP) API integration for bulk password auditing (implemented in v1.3.0 under k-Anonymity / ADR-011).
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
* **FR-03.3:** The symmetric encryption key is derived exclusively on the client using **Argon2id with 64 MB memory and 3 rounds** (with transparent auto-upgrade from legacy **PBKDF2-HMAC-SHA256 with 600,000 iterations**).
* **FR-03.4:** The entire vault payload (all `VaultItem` serialized in JSON) is encrypted using **256-bit AES-GCM** with a unique random 12-byte initialization vector (`IV`) for each save operation.
* **FR-03.5:** Storing the master password or derived key in plaintext in any persistent storage mechanism (`localStorage`, `sessionStorage`, `IndexedDB`, `cookies`) is strictly forbidden.

### FR-04: Quick Unlock via WebAuthn / Passkeys
* **FR-04.1:** After the first successful unlock with the Master Password, the user can enroll their device in **WebAuthn / FIDO2**.
* **FR-04.2:** On Windows workstations, the system uses the integrated platform authenticator (**Windows Hello**), allowing unlock via **numeric PIN or biometrics**.
* **FR-04.3:** On mobile devices (Android/iOS) and macOS, it uses the native biometric sensor (Touch ID, Face ID, or Android fingerprint sensor).
* **FR-04.4:** Wrapping mechanism: The vault derived key is encrypted using a local key generated for WebAuthn and stored protected in IndexedDB. Accessing this wrapped key requires successful user verification (`userVerification: "required"`).
* **FR-04.5:** If the user resets the browser or the biometric session fails 3 times, the system immediately reverts to prompting for the Master Password.

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

### FR-13: Security Panel and Granular Multi-Device Session Management
* **FR-13.1:** The system maintains a Cloudflare D1 record (`sessions`) for each authenticated device, binding a SHA-256 hash of the session token, IP address, User-Agent, browser fingerprint, and timestamps (`created_at`, `last_active_at`).
* **FR-13.2:** The UI exposes a Security & Audit modal (`SecurityModal`) that visually distinguishes the currently active session from remote sessions.
* **FR-13.3:** The user can terminate sessions individually (`DELETE /api/auth/sessions/:id`) or close all other sessions at once (`DELETE /api/auth/sessions`). When a session is revoked, subsequent requests bearing that token are rejected immediately.
* **FR-13.4:** The user can rename devices with friendly custom identifiers (e.g. *"Work MacBook"*, *"Home Desktop PC"*). Custom names are permanently preserved both in Cloudflare D1 and in IndexedDB `LocalUserConfig`, preventing overwrites on background refreshes.

### FR-14: Hardware Passkeys Management & Remote Revocation (WebAuthn / FIDO2)
* **FR-14.1:** The Security modal lists all registered Passkey credentials on the account (`passkeys`), displaying custom name, creation date, last used timestamp, and whether it corresponds to the current local device.
* **FR-14.2:** Users can customize the name of each Passkey with dual persistent storage in IndexedDB and Cloudflare D1.
* **FR-14.3:** **Remote Passkey Revocation:** Users can delete and revoke any registered Passkey (`DELETE /api/passkeys/:id`). If a session was terminated on a shared or remote computer, remotely deleting the associated Passkey eliminates any possibility of biometric or Windows Hello PIN re-entry on that workstation.
* **FR-14.4:** **Windows Hello Bypass Elimination:** Mitigates involuntary or forced platform bypass by enforcing strict credential verification before unlocking access to the wrapped decryption key in local storage.

### FR-15: Zero-Knowledge Bilingual Internationalization (i18n ES/EN) Subsystem
* **FR-15.1:** Complete, simultaneous support for **Spanish** and **English** across all components, modals, alerts, password generator, keyboard shortcuts, and locale-aware date/time formatting.
* **FR-15.2:** Zero privacy leakage: translations reside entirely in static client-side compiled dictionaries (`src/i18n/locales/`), without third-party translation APIs or telemetry compromising secrets.
* **FR-15.3:** Build-time type parity: `TranslationSchema` and dot-notation keys (`TranslationKey`) enforce that any missing translation key or interpolation parameter in any language causes a TypeScript compilation failure.
* **FR-15.4:** Dynamic language switcher with browser locale auto-detection, local persistence in `localStorage` (`revolt_lang`), and quick switching via navbar, login/lock cards, and Command Palette (`Ctrl + K`).

### FR-16: Immutable Security Audit Log Subsystem
* **FR-16.1:** The Cloudflare Worker records critical security events in the `audit_logs` table (user logons, passkey enrollments, session terminations, remote revocations, and credential changes).
* **FR-16.2:** The UI presents a chronological audit history formatted to the active locale (`es-ES` / `en-US`), with server-side deduplication to prevent log flooding during background synchronizations.

### FR-17: Cross-Account Secure Sharing (Milestone v2.5 - ADR-014)
* **FR-17.1:** **Zero-Knowledge Asymmetric Key Agreement:** Users can share individual secret items (organizational TOTP seeds, access notes, or credentials) with other registered accounts via ECDH P-384 elliptic curve Diffie-Hellman key agreement and AES-256-GCM symmetric encapsulation.
* **FR-17.2:** **Granular Permissions and Audit:** Support for read-only (`read`) or collaborative editing (`write`) privileges. Every sharing, modification, or revocation operation logs a traceable event in `audit_logs`.
* **FR-17.3:** **Sovereign Revocation and Lifecycle:** The item owner can revoke access at any time (`DELETE /api/shared-items/:id`), instantly removing the item from recipient sync updates. The UI presents standard advice to rotate the credential at the destination service when appropriate.
* **FR-17.4:** **Volatile RAM Isolation:** Decrypted incoming shared items reside **strictly in volatile client RAM memory**. They are never persisted as plaintext to IndexedDB or local disk, and are immediately purged on vault lock.
* **FR-17.5:** **Out-of-Band Key Fingerprint Verification:** The UI displays the SHA-256 cryptographic fingerprint of the recipient's public key (`SHA-256(spki)`) to enable out-of-band verification against public key substitution attacks.

### FR-18: Polymorphic Secrets Suite (v2.0.0)
* **FR-18.1:** The vault data schema supports 6 canonical types (`type: VaultItemType`): `totp`, `login`, `card`, `note`, `server_key`, and `identity`.
* **FR-18.2:** **Login Type:** Management of username, masked password, configurable CSPRNG password generator, website URLs with direct launch, integrated 2FA/TOTP token, and chronological immutable password history (`password_history`).
* **FR-18.3:** **Card Type (`card`):** Card number with 4-digit formatting, automatic card brand detection (Visa, Mastercard, Amex, Discover, etc.), cardholder name, expiration (`MM/YY`), and secure toggle reveal for CVV and PIN codes.
* **FR-18.4:** **Secure Note Type (`note`):** Structured and formatted Markdown text with character count display and secure rendering preventing HTML injection.
* **FR-18.5:** **Server/SSH Key Type (`server_key`):** Host, port (default 22), username, public key, masked multiline private key, and optional passphrase.
* **FR-18.6:** **Identity Type (`identity`):** Title, first name, last name, identification numbers (National ID/Passport), email, phone numbers, and postal address.

### FR-19: Per-Item Envelope Key Wrapping (`item_key`)
* **FR-19.1:** Each vault item (`VaultItem`) contains an `encrypted_key: "${ivBase64}:${ciphertextBase64}"` wrapping a unique 256-bit symmetric key generated via `crypto.getRandomValues(32)`.
* **FR-19.2:** Wrapping and unwrapping execute exclusively client-side via AES-256-GCM under the user's master key.
* **FR-19.3:** Existing accounts from prior versions (`v1.x`) are automatically normalized and upgraded during load/save operations, setting `type = 'totp'` and generating a fresh wrapped `item_key` without user friction.

### FR-20: 30-Day Trash Bin & Cryptographic Auto-Purge
* **FR-20.1:** Item deletion performs a logical soft-delete, tagging the item with a `deleted_at: number` epoch millisecond timestamp.
* **FR-20.2:** The UI provides a dedicated Trash tab/filter displaying deleted items with countdown indicators showing remaining days and hours before permanent destruction.
* **FR-20.3:** Users can restore items to their original location with 1 click or shred them permanently on demand.
* **FR-20.4:** During each vault save/encryption cycle (`encryptVault`), the system performs an automated cryptographic purge that permanently discards from the serialized JSON any item whose `deleted_at` exceeds 30 days, preventing residual ciphertext leaks.

### FR-21: Historical Snapshots in Cloudflare D1 & Optimistic Rollback
* **FR-21.1:** On every successful remote synchronization (`PUT /api/vault`), the Worker atomically archives the preceding state in Cloudflare D1's `vault_snapshots` table.
* **FR-21.2:** A strict rolling window of at most 5 versions per user is enforced, automatically pruning older snapshots to respect Cloudflare free tier quotas.
* **FR-21.3:** The `GET /api/vault/snapshots` endpoint exposes version history including creation timestamps (`created_at`) and version numbers.
* **FR-21.4:** The `POST /api/vault/restore/:vault_version` endpoint executes atomic rollback to a selected snapshot, incrementing version to `current.version + 1` to preserve optimistic concurrency control (OCC) monotonicity.

### FR-22: Physical Printable Emergency Kit
* **FR-22.1:** The user can generate a printable physical emergency recovery kit at any time from the security modal.
* **FR-22.2:** 100% offline client-side generation: The HTML document is generated locally in memory and triggered via `window.print()` without making external third-party requests.
* **FR-22.3:** The sheet includes a high-definition vector SVG QR code with the current encrypted vault payload (`vault_data`), step-by-step restoration instructions, and a high-visibility physical box for handwritten Master Password storage.
* **FR-22.4:** Under strict Zero-Knowledge rules, Master Passwords and derived cryptographic keys are never rendered in the DOM or encoded in the printed QR.

---

## 5. Non-Functional Requirements (NFR)

### NFR-01: Performance and Latency
* **TOTP Code Computation:** Execution time under **5 milliseconds** on any modern CPU.
* **KDF Derivation (Argon2id 64MB / PBKDF2 600k):** Derivation time under **400-800 milliseconds** on standard desktop hardware. To avoid freezing user interface frame rates (FPS), heavy derivation must execute in a dedicated **Web Worker**.
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

---

## 7. Competitive Differentiation Matrix

Revolt Pass is uniquely positioned in the marketplace as the **only free, open-source Zero-Knowledge manager featuring native asymmetric cross-account sharing**:

| Comparison Vector | Revolt Pass | Bitwarden | 1Password | Aegis Authenticator | Google Authenticator |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cryptographic Paradigm** | **Native Zero-Knowledge** (Web Crypto API) | Zero-Knowledge | Zero-Knowledge | Local Zero-Knowledge | Optional cloud sync (no strict E2EE) |
| **Default KDF** | **Argon2id WASM (64 MB)** | PBKDF2 / Argon2id | PBKDF2 / Argon2id | Argon2id / scrypt | PBKDF2 |
| **Proactive Alerts ($0)** | **Web Push RFC 8291 + BYOK** | Paid / Requires Plan | Paid / Requires Plan | Not available | Not available |
| **Cross-Account Secure Sharing** | **Yes** (v2.5 ECDH P-384 native) | Yes (Paid Organization required) | Yes (Paid commercial) | No (Manual file export only) | No (Mass QR export only) |
| **User Operational Cost** | **$0 / Always Free** (Cloudflare Free Tier) | $3 - $4 / user / month to share | $3 - $8 / user / month | Free (Local only) | Free |
| **Windows Hello PIN Unlock** | **Yes** (WebAuthn Level 3) | Requires desktop app | Requires desktop app | Not applicable (Android only) | Not applicable |
| **Structured Recovery Codes** | **Yes** (Integrated per account) | No (Generic note field) | No (Generic note field) | No | No |
| **Licensing & Sovereignty** | **GNU AGPLv3** (100% Open Source) | Partially open server | Closed / Proprietary | GPLv3 (Android only) | Proprietary |
| **Telemetry & Trackers** | **Zero Telemetry** | Optional analytics | Commercial telemetry | Zero Telemetry | Telemetry tied to Google Account |
