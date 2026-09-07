# Changelog

All notable changes to **Revolt Pass** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] - 2026-09-07

### Added
- **Universal Importers Engine (`src/lib/importers/`):**
  - Pure TypeScript zero-knowledge parsing engine supporting 10 industry-standard platforms and formats:
    - **Google Authenticator:** Native Protobuf binary decoder for `otpauth-migration://offline?data=...` migration URLs.
    - **Authy:** Community export and desktop token backup JSON format parser.
    - **Aegis Authenticator:** Plaintext JSON parser with encrypted vault detection and user guidance.
    - **2FAS:** Native `.2fas` JSON format parser.
    - **Bitwarden:** JSON export and RFC 4180 CSV export parser (extracts `login_totp`).
    - **1Password:** CSV export and 1PUX JSON format parser (extracts `one-time password` fields).
    - **Proton Pass:** JSON export and CSV export parser (`totpUri` / `totp`).
    - **Ente Auth:** JSON export parser.
    - **LastPass Authenticator:** CSV export parser (`extra` / `totp`).
    - **Plain URI Lists:** Multi-line `otpauth://totp/...` and `otpauth://hotp/...` URI list parser.
  - Intelligent format auto-detection by file extension and payload structure heuristics.
  - Interactive smart reconciliation engine (`reconcile.ts`):
    - Categorizes incoming accounts into `new`, `duplicate`, and `conflict` (matching issuer/account with differing secrets or parameters).
    - Configurable conflict resolution strategies: `keep_existing` (preserves existing vault items), `overwrite` (updates with imported secrets), and `keep_both` (imports duplicates with distinct identifiers).
    - Interactive preview table displaying account badges, issuers, algorithm/digit parameters, and reconciliation status before applying.
    - Drag-and-drop file upload, file browsing, and direct clipboard / URI paste mode.
    - Camera QR scanner interop: scanning a Google Authenticator multi-account migration QR code automatically launches the reconciliation flow.
- **Open Vault Exporters (`src/lib/exporters/`):**
  - Open-standard export options alongside existing Revolt encrypted/plaintext backups:
    - **Aegis Authenticator JSON:** Standard unencrypted Aegis backup JSON for easy migration to Android open-source authenticators.
    - **Bitwarden CSV:** Standard Bitwarden-compatible vault CSV export.
    - **Standard `otpauth://` List:** Plaintext multi-line list of standard OTP URIs.
- **YubiKey & FIDO2 Roaming Security Keys (WebAuthn):**
  - Cross-platform WebAuthn authenticator attachment (`cross-platform`) for physical FIDO2 hardware keys (YubiKey 5 Series, Feitian, SoloKeys, Nitrokey).
  - Multi-transport authentication support (`usb`, `nfc`, `ble`, `internal`).
  - Toggle between platform biometrics (Windows Hello, Touch ID, Face ID) and physical hardware security keys in the passkey enrollment interface.
- **Security Audit Log Export:**
  - One-click export of complete audit log history in **CSV** or **JSON** format directly from the Security Modal.
- **Session Token Sliding Window & Concurrency Resilience:**
  - Cloudflare D1 migration adding `prev_token_hash` column and index on `sessions` table.
  - Grace-period sliding window allowing requests signed with the immediate previous token to succeed during concurrent background token rotations.
  - Client-side proactive token re-sync via `getUserConfig()` on active sessions, passkeys, and audit log tabs.

### Changed
- Bumped project version to `v1.4.0` across `package.json` and `src/constants/version.ts`.
- Expanded automated test suite from 94 to **111 tests** across 15 test suites, verifying Protobuf decoders, all 10 importer parsers, reconciliation strategies, and D1 sliding grace window.

---

## [1.3.1] - 2026-09-07

### Security & Hardening
- **Content-Security-Policy (CSP) Header (FIX-01):**
  - Enforced strict CSP on all static asset responses from the Cloudflare Worker, mitigating Cross-Site Scripting (XSS / VEC-06).
  - Restricts default, script, font, and frame ancestors, with scoped image/connect sources for trusted CDNs (`cdn.simpleicons.org`).
- **Edge Rate Limiting on Sensitive Endpoints (FIX-02):**
  - Implemented Cloudflare Workers native rate limiter integration on `/api/auth/salt` and `/api/auth/register`.
  - Returns `HTTP 429 Too Many Requests` with `Retry-After: 60` header when rate limits are exceeded, mitigating username enumeration and automated account creation attacks.
  - Documented configuration binding in `wrangler.toml.example`.
- **Domain-Restricted CORS Origin (FIX-03):**
  - Replaced permissive wildcard CORS (`*`) with dynamic configuration reflecting `env.APP_DOMAIN` in production environments.
  - Gracefully falls back to wildcard only on unconfigured local development setups.
- **Sliding Session Token Rotation on Sync (FIX-04):**
  - Implemented automatic token rotation during vault synchronization (`GET /api/vault` and `PUT /api/vault`).
  - Worker returns `X-New-Session-Token` with a new cryptographically random token hash upon authenticated sync.
  - Client (`syncEngine.ts`) intercepts the header and updates the active session token in IndexedDB (`user_config`).
  - Immediately invalidates previous token hashes in D1, drastically reducing exposure window of stolen tokens.
  - Extended session validity sliding window on each authenticated interaction.

### Changed
- Bumped project version to `v1.3.1` across `package.json` and `src/constants/version.ts`.
- Expanded automated test suite from 88 to **94 tests** across 14 test suites, verifying CSP headers, rate limiters, CORS policies, and sliding session token rotation.

---

## [1.3.0] - 2026-09-07

### Added
- **Vault Health & Hygiene Diagnostic Engine (`vaultHygiene.ts`):**
  - Real-time client-side analysis of vault accounts, evaluating cryptographic entropy, secret duplication, and recovery readiness.
  - Identification of reused TOTP secrets across services.
  - Detection of low-entropy Base32 secrets (<16 chars / <80 bits) susceptible to brute-force attacks.
  - Verification of missing or exhausted one-time recovery codes.
  - Tracking of backup freshness with alerts when no backup has been exported in over 30 days.
  - Weighted health score calculation (0–100%) and grading scale (*Excellent*, *Good*, *Needs Improvement*, *Critical*).
- **Zero-Knowledge Breach Detection via k-Anonymity (`pwnedCheck.ts`):**
  - Verification of credential exposure against HaveIBeenPwned's database of over 800 million breached records.
  - Client-side SHA-1 hashing using Web Crypto API.
  - Strict k-Anonymity model: only the first 5 hexadecimal characters of the SHA-1 hash are sent to the edge proxy.
  - Full suffix matching (remaining 35 characters) executed entirely inside the user's browser.
  - Cloudflare Worker edge proxy (`GET /api/pwned-check`) with 24-hour edge caching (`Cache-Control: public, max-age=86400`) and `Add-Padding: true` to prevent response length side-channel attacks.
- **Visual Health Scorecard & Diagnostics Tab (`SecurityModal.tsx`):**
  - Dedicated "Health & Diagnostics" tab in the Security Panel featuring a radial score indicator, category pills, and quick metric tiles.
  - Actionable issue resolution cards with direct shortcuts to export backups or review specific accounts.
  - Interactive HaveIBeenPwned leak checker with instant feedback and zero-knowledge privacy guarantee explanations.
- **Automated Backup Timestamp Tracking:**
  - Automated timestamp recording on encrypted and plaintext backup exports (`revolt_last_backup`).
  - Real-time reactive updates via custom DOM events (`revolt:backup-updated`).

### Changed
- Bumped project version to `v1.3.0` across `package.json` and `version.ts`.
- Expanded automated test suite to 88 tests across 14 test suites, covering k-Anonymity edge proxies, SHA-1 range parsing, and vault hygiene score calculations.
- Updated technical roadmaps (`docs/es/05-ROADMAP.md` and `docs/en/05-ROADMAP.md`) marking Milestone v1.3 as completed and deployed.

---

## [1.2.1] - 2026-09-06

### Added
- **Open-Source Repository Decoupling & Private Instance Mode:**
  - Configurable `VITE_PRIVATE_INSTANCE` environment variable allowing public self-hosting without private access restrictions.
  - Protected author instance overlay screen with subtle authentication shortcuts (`Ctrl + Alt + U`, `Ctrl + Shift + U`, and triple-click shield trigger).
  - Remote Cloudflare D1 SQLite database `BEFORE INSERT` trigger preventing unauthorized registrations as a defense-in-depth measure.
- **Comprehensive Open-Source Licensing & Brand Protection:**
  - **GNU Affero General Public License v3 (AGPL-3.0-only)** adopted with Section 7(e) **Trademark & Brand Assets Policy**.
  - Bilingual security policies ([`SECURITY.md`](./SECURITY.md) and [`SECURITY.es.md`](./SECURITY.es.md)) integrated with GitHub Private Vulnerability Reporting.
- **Documentation Overhaul:**
  - Structured PRD, Architecture, Threat Model, ADRs, and Quality-Driven Technical Roadmap in both English and Spanish (`docs/en/` and `docs/es/`).

---

## [1.2.0] - 2026-09-05

### Added
- **Full Bilingual Internationalization (i18n):**
  - Complete zero-knowledge, client-side translation engine in Spanish (`es`) and English (`en`).
  - Compile-time type safety via TypeScript `TranslationSchema` and recursive `TranslationPath`.
  - Automatic browser language detection with local preference persistence in `localStorage`.
  - Seamless in-app language switcher component in navigation headers and authentication screens.

### Changed
- Refactored all UI components, dialogs, command palettes, toasts, and error messages to use semantic translation keys.

---

## [1.1.0] - 2026-09-04

### Added
- **Multi-Device Session & Access Control (`SecurityModal.tsx`):**
  - Remote session tracking with device type detection, location origin, and last-active timestamps stored in Cloudflare D1.
  - Granular single-session revocation and one-click "Log out all other devices" functionality.
  - Device friendly renaming with client-side synchronization.
- **FIDO2 / WebAuthn Biometric & Passkey Management:**
  - Enrollment, renaming, and remote revocation of hardware Passkeys and Windows Hello credentials.
  - Wrapped master key storage for instant local biometric unlocking.
- **Immutable Security Event Audit Log:**
  - Tamper-evident logging of critical authentication events, session revocations, and passkey lifecycle operations.

---

## [1.0.0] - 2026-09-03

### Added
- **Zero-Knowledge Core Architecture:**
  - Client-side master key derivation using PBKDF2 (600,000 iterations, SHA-256) running in an isolated background Web Worker.
  - Authenticated symmetric encryption using AES-256-GCM for all vault secrets, accounts, and emergency recovery codes.
  - Cloudflare Workers and Cloudflare D1 edge persistence: server only stores ciphertext and verification verifiers.
- **Offline-First Persistence & Synchronization:**
  - Local persistence powered by IndexedDB with deterministic clock drift compensation (`/api/time`).
  - Automatic background synchronization on connectivity changes (`online` event listener).
- **Hardened Security Features:**
  - Configurable inactivity AutoLock with instant RAM memory wiping (CryptoKey zeroization).
  - Clipboard Guard with automated 45-second memory purge.
- **Modern User Experience:**
  - Dark-Mode First interface inspired by Linear and Raycast.
  - Universal Quick Command Palette (`Ctrl + K`).
  - QR Code scanner via device camera, drag-and-drop file upload, or clipboard paste (`Ctrl + V`).
  - Encrypted JSON vault backup export and import.
  - Full Progressive Web App (PWA) offline installation with Service Worker precaching.
