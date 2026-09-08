# Changelog

All notable changes to **Revolt Pass** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.1] - 2026-09-08

### Added
- **GitHub Community & Open Source Health Infrastructure:**
  - Automated CI workflow (`.github/workflows/ci.yml`) executing linting, full test suite execution, and production build validation on push and pull requests to `main`.
  - Automated weekly dependency update configuration via Dependabot (`.github/dependabot.yml`).
  - GitHub issue templates (`.github/ISSUE_TEMPLATE/`): structured YAML forms for Bug Reports and Feature Requests with Zero-Knowledge security considerations, plus blank issue disabling in `config.yml`.
  - Pull Request contribution template (`.github/PULL_REQUEST_TEMPLATE.md`) enforcing cryptographic integrity checks, test coverage, and documentation verification.
  - Project funding configuration (`.github/FUNDING.yml`) for GitHub Sponsors.
  - Contributor Covenant Code of Conduct v2.1 in English (`CODE_OF_CONDUCT.en.md`) and Spanish (`CODE_OF_CONDUCT.md`).
- **Comprehensive Test Suite Expansion (175/175 passing tests):**
  - Added 32 new unit and integration tests across 7 previously uncovered modules:
    - Exporters: Aegis JSON (`aegisExport.test.ts`), otpauth URI text (`otpauthExport.test.ts`), and Bitwarden CSV (`bitwardenExport.test.ts`).
    - Importers: Google Authenticator migration payload parser (`googleAuth.test.ts`), multi-vault merge/reconciliation engine (`reconcile.test.ts`), and format auto-detector (`detector.test.ts`).
    - Sync engine: client synchronization, conflict handling, and pull/push workflows (`syncEngine.test.ts`).
- **Test Coverage Provider & Quality Gates (`vitest.config.ts`):**
  - Integrated `@vitest/coverage-v8` with strict threshold enforcement across critical modules:
    - Crypto core (`src/lib/crypto/**`): 75% lines / 80% functions / 65% branches.
    - Security core (`src/lib/security/**`): 80% lines / 80% functions.
    - Sync engine (`src/lib/sync/**`): 75% lines / 75% functions.
  - Added `pnpm test:coverage` and `pnpm test:watch` npm scripts.
- **Social Sharing & Open Graph Metadata:**
  - Added 1200x630px high-resolution Open Graph banner (`public/og-image.png`) with branded shield emblem and feature highlights generated via `scripts/generate-og-image.js`.
  - Complete Open Graph and Twitter Card tags in `index.html` with dynamic `%VITE_APP_DOMAIN%` interpolation fallback in `vite.config.ts`.
  - Documented `VITE_APP_DOMAIN` in `.env.example`.

### Changed
- **Package & Tooling Polish:**
  - Added `engines` requirements (`node >=20.0.0`, `pnpm >=9.0.0`) in `package.json`.
  - Added developer convenience scripts: `lint:fix`, `typecheck`, and `icons`.
  - Upgraded Oxlint configuration (`.oxlintrc.json`) with strict security rules (`no-eval`, `no-implied-eval`, `no-new-func`), TypeScript rules, and Node/Worker environment globals.
  - Updated dynamic badges in `README.md` and `README.en.md` for live GitHub Actions CI status, package version API, and passing tests.
- **Scaffold Cleanup & Fixes:**
  - Removed unused template assets (`src/assets/react.svg` and `src/assets/vite.svg`).
  - Fixed React Hook ordering violation in `src/components/PolymorphicItemCard.tsx`.

---

## [2.0.0] - 2026-09-08

### Added
- **Suite Integral de Secretos (Polymorphic Secrets Engine):**
  - Transformed Revolt Pass from a dedicated 2FA authenticator into a full-fledged Zero-Knowledge Password & Secrets Manager.
  - Added support for 6 canonical secret types:
    - `totp`: Time-based One-Time Passwords with real-time countdown, RFC 6238 drift compensation, and backup codes manager.
    - `login`: Web logins with username, password reveal/mask, copy timeout, CSPRNG password generator, website URL, inline 2FA seed, and password history tracking.
    - `card`: Credit and debit cards with cardholder name, masked card number, brand auto-detection (Visa, Mastercard, Amex, Discover), expiration date, CVV reveal, and ATM PIN reveal.
    - `note`: End-to-end encrypted freeform markdown notes for sensitive records and seed phrases.
    - `server_key`: SSH and API keys with host, port, username, public key, private key (masked/reveal), passphrase, and token fields.
    - `identity`: Personal identity documents with first/last name, email, phone, national ID / passport number, and physical address.
  - Backward compatibility: existing v1.0–v1.5 2FA vaults are automatically normalized and auto-upgraded without requiring user intervention.
- **Per-Item Symmetric Key Wrapping (`encrypted_key`):**
  - Envelope encryption architecture: every item is protected by an independent 256-bit AES-GCM `item_key`, encrypted under the user's Master Key (`${ivBase64}:${ciphertextBase64}`).
  - Lays the cryptographic foundation for granular per-item sharing via ECDH in Milestone v2.5.
- **30-Day Soft-Delete Trash Bin & Cryptographic Auto-Purge:**
  - Soft deletion sets `deleted_at: timestamp`.
  - Cryptographic auto-purge: items exceeding 30 days in the trash are automatically and irreversibly purged from memory and ciphertext during `encryptVault`.
  - Dedicated trash filter tab in `VaultList` with badge counters, remaining days indicator, 1-click restore, individual permanent delete, and bulk "Vaciar Papelera" actions.
- **Cloudflare D1 Vault Snapshots & Optimistic Rollback (`src/worker/api.ts`):**
  - Automatic snapshot archiving in D1 on every `PUT /api/vault`, maintaining a rolling window of the 5 most recent vault states.
  - Endpoints: `GET /api/vault/snapshots` and `POST /api/vault/restore/:vault_version`.
  - Concurrency-safe rollback: restored snapshots are promoted to `current.version + 1`, enforcing strict Optimistic Concurrency Control (OCC) across all devices and triggering instant client pull synchronization.
  - "Historial de Bóveda" (snapshots) tab in `SecurityModal` with version badges, item counts, timestamps, and 1-click rollback.
- **100% Client-Side Printable Emergency Kit (`src/lib/utils/emergencyKit.ts`):**
  - Generates an offline, vector-rendered HTML printable disaster recovery sheet (`window.print()`).
  - High-resolution SVG QR code encoding Instance URL, User ID, and username for instant device pairing.
  - Designated handwritten Master Password box and security instructions. Plaintext master password is never stored, displayed, or printed.
  - Integrated via `EmergencyKitModal.tsx` and accessible directly from the Security Modal.
- **Polymorphic UI Suite & Password Generator:**
  - `PolymorphicItemCard.tsx`: Tailored card views for all 6 secret types with inline copy-guard (45s clipboard purge), password reveal, and trash mode.
  - `EditAccountModal.tsx`: Comprehensive secret creator and editor with type-selector tabs, CSPRNG password generator, auto-detection, and password history tracking (`recordPasswordHistory`).
  - `VaultList.tsx`: Category filter pills (`all`, `login`, `totp`, `card`, `note`, `server_key`, `identity`, `trash`), badge counters, and view switcher.

### Changed
- Bumped project version to `v2.0.0` in `package.json` and `src/constants/version.ts`.
- Migrated Cloudflare D1 schema with `vault_snapshots` and `folders` tables.
- Verified test suite: **143 passing automated tests** across 18 test files.

---

## [1.5.0] - 2026-09-08

### Added
- **Argon2id Memory-Hard KDF Core (`src/lib/crypto/kdf.ts` & `kdf.worker.ts`):**
  - Upgraded Master Key Derivation Function from PBKDF2 to **Argon2id** (OWASP recommended: 64 MB memory cost, 3 iterations, 1 parallelism thread) compiled to WebAssembly via `hash-wasm`.
  - Immune to GPU/ASIC parallel brute-force cluster attacks, while maintaining sub-400ms derivation speed on commodity client devices.
  - **Seamless Silent Background Auto-Upgrade:** Existing PBKDF2 accounts are automatically, silently re-keyed and upgraded to Argon2id upon their next successful login or unlock, re-encrypting the vault and updating `kdf_algorithm` in Cloudflare D1 via atomic `POST /api/auth/upgrade-kdf`.
  - Automatic passkey re-wrapping: existing Windows Hello / FIDO2 biometric bindings are automatically re-wrapped with the new Argon2id Master Key without prompting the user.
  - Manual upgrade interface in the Security Modal for users wishing to trigger and inspect the migration immediately.
  - Backward compatibility: legacy PBKDF2 accounts decrypt flawlessly and display their current cryptographic parameters.
- **Native Zero-Knowledge Web Push Security Alerts (`src/worker/push.ts` & `public/push-sw.js`):**
  - Real-time instant push notifications delivered directly to user devices via native browser Push API and Service Worker (`push-sw.js`).
  - Zero-cost, zero-account-creation: notifications are sent directly from the Cloudflare Worker to browser push services (Google FCM, Apple APNs, Mozilla Push) via RFC 8292 (VAPID) and RFC 8291 (AES-128-GCM message encryption).
  - VAPID keys generated and securely persisted in the database (`app_settings`), with zero hardcoded server credentials.
  - Triggers alerts on critical hygiene events: login from an unrecognized country, new session creation, remote session revocation, and passkey registration.
  - 100% Zero-Knowledge: payloads contain only sanitised hygiene metadata (event description, device name, country, timestamp), never vault item contents or secrets.
- **Bring Your Own Key (BYOK) Email Alerter (`src/worker/email.ts`):**
  - User-configurable proactive email alerts maintaining a strict **$0 operational cost** footprint for the self-hosted instance owner:
    - **Resend (Recommended):** Users supply their personal free-tier API key (3,000 emails/month free).
    - **Cloudflare Email (`send_email`):** Direct Worker outbound email support with prominent UI badge and warning stating the Cloudflare Workers Paid ($5/month) plan requirement on the user's account.
  - Dark-mode branded HTML alert email templates styled with Revolt Pass design language.
  - Granular event toggles: independently toggle alerts for new country, new session, session revocation, and passkey addition.
  - In-app test notification buttons for both Web Push and BYOK Email with immediate feedback.
- **Security Modal Notifications Tab (`src/components/SecurityModal.tsx`):**
  - Dedicated "Notifications" tab featuring live push subscription status, activate/unsubscribe controls, BYOK email configuration, and active KDF algorithm diagnostics.
  - Dynamic lock screen and authentication badges reflecting active cryptographic engine (`Argon2id 64MB` vs `PBKDF2 600K`).

### Changed
- Bumped project version to `v1.5.0` across `package.json` and `src/constants/version.ts`.
- Database schema updated with `kdf_algorithm` column on `users`, `push_subscriptions`, `user_notification_settings`, and `app_settings` tables.
- Expanded test suite to **134 passing automated tests** across 17 test suites, verifying Argon2id WASM derivation, cross-algorithm cryptographic isolation, VAPID key exchange, notification settings persistence, and Web Push subscription endpoints.

---

## [1.4.1] - 2026-09-07

### Added
- **Multi-Account QR Carousel Exporter (`src/lib/exporters/protobufEncoder.ts` & `QrCarouselModal.tsx`):**
  - Pure TypeScript Protocol Buffers encoder generating official `otpauth-migration://offline?data=...` migration URIs.
  - Automatic account batching (chunked into 7 accounts per QR) guaranteeing optimal optical contrast and instant smartphone camera scanning.
  - Interactive multi-step carousel with step progress indicator ("Code 1 of 3"), segmented progress bar, keyboard arrow navigation (Left/Right), and raw migration URI copy.
  - Integrated directly as an export method in `BackupModal.tsx` for zero-friction migration to Google Authenticator, Aegis, 2FAS, or another Revolt Pass instance.
- **Individual Account QR Code Viewer (`AccountQrModal.tsx`):**
  - High-contrast, sharp vector SVG QR code viewer for any individual vault account (`otpauth://totp/...`).
  - Accessible directly via the "View QR" button in `EditAccountModal.tsx` and the contextual dropdown menu on every `TotpCard.tsx`.
  - Displays issuer identity, account name, algorithm/digit badges, togglable Base32 secret viewer, and one-click URI copying.
  - 100% universal: scannable by any mobile authenticator in the world (Google Authenticator, Microsoft Authenticator, Apple Passwords, Aegis, 2FAS, Bitwarden, 1Password, etc.).
- **Vector SVG QR Rendering Utility (`src/lib/utils/qrRenderer.ts`):**
  - Pure vector SVG rendering using ZXing with quiet zones and high-contrast white container styling for crisp display across all display resolutions.

### Changed
- Bumped project version to `v1.4.1` across `package.json` and `src/constants/version.ts`.
- Expanded test suite from 111 to **114 automated tests** across 16 test suites, verifying Protobuf payload encoding, batch chunking, round-trip serialization/deserialization, and standard `otpauth://` generation.

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
