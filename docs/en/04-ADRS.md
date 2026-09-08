# Architecture Decision Records (ADRs)
## Project: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadata | Detail |
| :--- | :--- |
| **Document Identifier** | `RP-ADR-004` |
| **Version** | `1.2.1-PROD` |
| **Status** | Approved / Living Architecture Decision Record |
| **Format Standard** | Nygard / MADR (Markdown Architectural Decision Records) |
| **License** | GNU AGPLv3 + Revolt Group Trademark Policy |

---

## Architecture Decision Index

- [ADR-001: Adoption of Progressive Web App (PWA) with `vite-plugin-pwa` vs. Native Application (Electron / Tauri / Mobile)](#adr-001-adoption-of-progressive-web-app-pwa-with-vite-plugin-pwa-vs-native-application-electron--tauri--mobile)
- [ADR-002: Serverless Edge Infrastructure with Cloudflare Workers + Cloudflare D1 vs. Supabase or Traditional Backend](#adr-002-serverless-edge-infrastructure-with-cloudflare-workers--cloudflare-d1-vs-supabase-or-traditional-backend)
- [ADR-003: Native Web Crypto API (`crypto.subtle`) vs. Third-Party Cryptographic Libraries (CryptoJS / Node Crypto)](#adr-003-native-web-crypto-api-cryptosubtle-vs-third-party-cryptographic-libraries-cryptojs--node-crypto)
- [ADR-004: Client-Side Zero-Knowledge Cryptographic Architecture with AES-256-GCM and PBKDF2](#adr-004-client-side-zero-knowledge-cryptographic-architecture-with-aes-256-gcm-and-pbkdf2)
- [ADR-005: Local Quick Unlock via WebAuthn / Platform Authenticator (Windows Hello with PIN / Mobile Biometrics)](#adr-005-local-quick-unlock-via-webauthn--platform-authenticator-windows-hello-with-pin--mobile-biometrics)
- [ADR-006: Structured Local Persistence with IndexedDB (`idb`) vs. `localStorage` / `sessionStorage`](#adr-006-structured-local-persistence-with-indexeddb-idb-vs-localstorage--sessionstorage)
- [ADR-007: Zero-Knowledge Client-Side Bilingual Internationalization (i18n ES/EN) with Strict Typing](#adr-007-zero-knowledge-client-side-bilingual-internationalization-i18n-esen-with-strict-typing)
- [ADR-008: Multi-Device Lifecycle, Granular Session Revocation, and Remote FIDO2 Passkey Deletion](#adr-008-multi-device-lifecycle-granular-session-revocation-and-remote-fido2-passkey-deletion)
- [ADR-009: Adoption of GNU AGPLv3 License with Strict Trademark & Brand Assets Policy](#adr-009-adoption-of-gnu-agplv3-license-with-strict-trademark--brand-assets-policy)
- [ADR-010: Decoupled Private Instance Mode and Community Self-Hosting (`VITE_PRIVATE_INSTANCE`)](#adr-010-decoupled-private-instance-mode-and-community-self-hosting-vite_private_instance)
- [ADR-011: Preventive Hygiene Diagnostics and Breach Detection via k-Anonymity](#adr-011-preventive-hygiene-diagnostics-and-breach-detection-via-k-anonymity)
- [ADR-012: Perimeter Hardening (CSP, Rate Limiting, CORS) and Sliding Session Rotation](#adr-012-perimeter-hardening-csp-rate-limiting-cors-and-sliding-session-rotation)
- [ADR-013: Native Protobuf Mass Ingestion, Differential Reconciliation, and Open Exporters](#adr-013-native-protobuf-mass-ingestion-differential-reconciliation-and-open-exporters)
- [ADR-014: Adoption of ECDH P-384 for Item Key Sharing](#adr-014-adoption-of-ecdh-p-384-for-item-key-sharing)

---

## ADR-001: Adoption of Progressive Web App (PWA) with `vite-plugin-pwa` vs. Native Application (Electron / Tauri / Mobile)

### Status
**Accepted**

### Context and Problem Statement
Revolt Pass must be available and provide an experience indistinguishable from a native application across multiple desktop environments (Windows 10/11, macOS, Linux) and mobile devices (iOS and Android), enabling home screen installation, keyboard shortcuts, 100% offline execution, and instant updates free from app store friction.

### Key Decision Drivers
1. **Iteration Velocity and Single Codebase:** Maintain a shared codebase (TypeScript + React) across all target platforms.
2. **System Resource Consumption:** Avoid the massive RAM overhead typical of full Chromium-based wrappers (Electron typically consumes 150 MB - 300 MB of RAM at idle).
3. **Sovereign Distribution and Instant Deployment:** Ability to deploy emergency security fixes to the `https://<your-domain-or-subdomain>.workers.dev` subdomain within seconds, without waiting for Apple App Store or Google Play Store approval processes.
4. **Access to Cryptographic Hardware:** Availability of Web Crypto API and WebAuthn (FIDO2) within the modern web standards across all major browsers.

### Evaluated Alternatives

#### 1. Progressive Web App (PWA) with Vite and Workbox (Selected Option)
* **Advantages:**
  * Single codebase for desktop and mobile.
  * Natively installable on Windows with Start Menu and taskbar integration.
  * Zero additional disk consumption (under 2 MB in local cache).
  * 100% offline execution via Workbox Service Worker.
  * Updates apply atomically and immediately upon browser reload.
* **Disadvantages:**
  * Browser sandboxing restrictions (cannot directly write to the OS filesystem without explicit user interaction).
  * On iOS Safari, PWAs have stricter cache eviction policies if left unused for multiple weeks (mitigated via persistent IndexedDB).

#### 2. Electron
* **Advantages:** Unrestricted access to Node.js native APIs and filesystem.
* **Disadvantages:**
  * Exorbitant installer size (>80 MB for a password utility).
  * Unacceptable RAM consumption (>200 MB).
  * Does not directly cover mobile phones (would require separate React Native or Flutter development).

#### 3. Tauri (Rust + Webview)
* **Advantages:** Ultralight binaries (<10 MB) and low desktop memory usage.
* **Disadvantages:**
  * Mobile support still maturing with higher cross-compilation complexity.
  * Requires Rust toolchain installed in CI/CD environments.
  * Higher friction for direct web deployments to `<your-domain.com>`.

### Decision
Adopt **Progressive Web App (PWA)** using `@vite-pwa/vite-plugin-pwa` and Workbox. Allows transparent installation on Windows as a standalone windowed app with full **Windows Hello** support, and on mobile via "Add to Home Screen".

---

## ADR-002: Serverless Edge Infrastructure with Cloudflare Workers + Cloudflare D1 vs. Supabase or Traditional Backend

### Status
**Accepted**

### Context and Problem Statement
The system requires a reliable, globally distributed synchronization backend with millisecond-level network latency to serve requests from any geographic location. Being a sovereign personal project with a Zero-Knowledge architecture, the backend does not execute complex business logic or cryptographic calculations; its role is to act as a high-availability REST intermediary to persist and serve encrypted binary blobs.

### Key Decision Drivers
1. **Zero Operating Cost (Sustainable Free Tier):** Run indefinitely within the free tier without requiring credit cards that bill for idle compute.
2. **Edge Latency:** Immediate response (<20ms) from any global CDN edge node.
3. **Operational Simplicity:** Zero Docker container management, OS patching, or PostgreSQL database provisioning.
4. **Cloud Security & Backing:** Native integration with Cloudflare WAF, DDoS protection, and automated TLS 1.3 certificates.

### Evaluated Alternatives

#### 1. Cloudflare Workers + Cloudflare D1 (Selected Option)
* **Advantages:**
  * Distributed serverless SQLite engine running natively on Cloudflare's edge network.
  * Generous free tier: 100,000 requests/day on Workers, 5,000,000 reads/day and 100,000 writes/day on D1.
  * 0 ms cold start latency powered by V8 Isolates.
  * `<your-domain.com>` already resides on Cloudflare DNS servers, simplifying routing.
  * Simple relational SQL schema with full ACID transactions.
* **Disadvantages:**
  * 5 GB maximum database size on free tier (completely irrelevant, as the entire vault is under 1 MB).
  * Serverless ecosystem bound to Wrangler API (mitigated because prepared SQL statements are portable to standard SQLite).

#### 2. Supabase (Self-Hosted PostgreSQL or Cloud)
* **Advantages:** Comprehensive authentication and Row Level Security (RLS) ecosystem.
* **Disadvantages:**
  * Unnecessary complexity: Supabase authentication and RLS features are redundant and counterproductive in a Zero-Knowledge model where the client manages cryptography.
  * Free tier pauses inactive projects after 7 days, forcing slow manual wakes.

#### 3. Traditional VPS Backend (Node.js + Fastify + PostgreSQL)
* **Advantages:** Full control over Linux environment.
* **Disadvantages:**
  * Fixed monthly hosting cost ($5 - $10 USD/month).
  * OS maintenance, firewalls, and manual Let's Encrypt certificate renewals.
  * Geographic single point of failure compared to Cloudflare's global Anycast network.

### Decision
Select **Cloudflare Workers combined with Cloudflare D1**, managed via `wrangler`. Represents the lowest latency, highest resilience, and zero fixed cost solution.

---

## ADR-003: Native Web Crypto API (`crypto.subtle`) vs. Third-Party Cryptographic Libraries (CryptoJS / Node Crypto)

### Status
**Accepted**

### Context and Problem Statement
Historically, many web applications relied on pure JavaScript libraries such as `crypto-js`, `forge`, or `elliptic` for hashing and encryption. These libraries introduce severe vulnerability risks to timing side-channel attacks, performance bottlenecks, and bloated bundle sizes.

### Key Decision Drivers
1. **Side-Channel Immunity:** Cryptographic operations implemented in constant-time.
2. **Maximum Cryptographic Throughput:** Native hardware acceleration (CPU instructions AES-NI and SHA Extensions).
3. **Auditability and Supply Chain Security:** Eliminating supply chain attack risks from malicious npm packages.
4. **Bundle Optimization:** Zero bundle footprint for the cryptographic suite.

### Evaluated Alternatives

#### 1. Native Web Crypto API (`window.crypto.subtle`) (Selected Option)
* **Advantages:**
  * Official W3C specification implemented directly within native browser engines (C++/Rust).
  * Hardware-accelerated execution: PBKDF2 and AES-GCM run at native machine code speeds.
  * Intrinsic immunity to timing attacks in symmetric encryption and HMAC verification.
  * Zero kilobytes added to application distribution bundle.
  * Keys marked `extractable: false` reside isolated in protected browser memory.
* **Disadvantages:**
  * Requires secure context (`https://` or `localhost`), guaranteed by design on `<your-domain.com>`.
  * Asynchronous Promise-based API requiring structured code design.

#### 2. CryptoJS (`crypto-js`)
* **Advantages:** Simple synchronous syntax and legacy project familiarity.
* **Disadvantages:**
  * Inactive maintenance with serious timing side-channel vulnerabilities.
  * Abysmal performance in pure JS: calculating 600,000 PBKDF2 iterations in CryptoJS freezes the browser tab for over 15 seconds.
  * Adds ~50 KB to the bundle without providing formal cryptographic guarantees.

### Decision
Mandate **exclusive usage of native Web Crypto API** for all cryptographic primitives (`subtle.deriveKey`, `subtle.encrypt`, `subtle.decrypt`, `subtle.sign`, `getRandomValues`). Third-party dependencies for encryption are strictly forbidden.

---

## ADR-004: Client-Side Zero-Knowledge Cryptographic Architecture with AES-256-GCM and PBKDF2

### Status
**Accepted**

### Context and Problem Statement
The architecture must ensure total privacy of 2FA secrets and recovery codes under any Cloudflare infrastructure compromise scenario, network interception, or third-party audits.

### Key Decision Drivers
1. **Principle of Least Privilege and Zero Trust:** Treat backend as an untrusted channel.
2. **Authenticated Integrity:** Ensure data cannot be tampered with in storage without immediate detection.
3. **Privacy Compliance:** Satisfy the strictest data protection regulations (GDPR / LGPD) by design, since the server lacks the technical capacity to decrypt user data.

### Decision
Implement a **strict Zero-Knowledge model**:
1. All sensitive user data (accounts, Base32 secrets, recovery codes, notes, tags) is bundled into a single in-memory data structure on client.
2. This structure is encrypted using **AES-256-GCM** with a key derived from the Master Password (PBKDF2-SHA256 with 600,000 rounds).
3. Every save produces a fresh, unique 12-byte initialization vector (IV).
4. Cloudflare server stores and synchronizes solely `{ user_id, encrypted_blob, iv, version, updated_at }`.

### Consequences
* **Positive:**
  * If Cloudflare's database is completely dumped, stolen data is useless to an attacker.
  * System requires no complex database masking schemas.
* **Negative / Risks:**
  * If the user forgets their Master Password and lacks local biometrics or plaintext backups, data is unrecoverable by design. No server-side "password reset" exists.

---

## ADR-005: Local Quick Unlock via WebAuthn / Platform Authenticator (Windows Hello with PIN / Mobile Biometrics)

### Status
**Accepted**

### Context and Problem Statement
Typing a 20+ character Master Password dozens of times a day causes user friction and prompts weak password habits. On Windows desktop workstations without biometric hardware, users unlock their OS via a **Windows Hello PIN**. Providing secure fast unlock via this native mechanism matching Touch ID / Face ID is essential.

### Decision
Adopt **WebAuthn Level 3** specifying `authenticatorAttachment: "platform"` and `userVerification: "required"`.
* On Windows 10/11, the browser triggers native Windows security asking for **Windows Hello PIN**.
* A locally derived symmetric wrapping key encrypts the master key in IndexedDB.
* Successful WebAuthn assertion releases the wrapping key to decrypt the master key in volatile RAM.
* This operates as a local convenience shortcut: WebAuthn credentials do not sync across devices. Each device authenticates initially with the Master Password.

---

## ADR-006: Structured Local Persistence with IndexedDB (`idb`) vs. `localStorage` / `sessionStorage`

### Status
**Accepted**

### Context and Problem Statement
The application must store the encrypted vault blob, WebAuthn wrapping key, and KDF parameters on the client device to guarantee offline operation.

### Evaluated Alternatives
1. **`localStorage`:** Synchronous, blocks main thread during read/write, limited to ~5 MB UTF-16 strings, directly accessible by any synchronous script.
2. **`IndexedDB` (via `idb` wrapper):** Asynchronous, transactional, supports direct binary types (`ArrayBuffer`, `Uint8Array`), virtually unlimited storage capacity (up to 60% of available browser profile disk space).

### Decision
Adopt **IndexedDB via the minimalist, typed wrapper `idb`**. Provides secure transactional operations without blocking the React UI thread, facilitating structured offline sync queues.

---

## ADR-007: Zero-Knowledge Client-Side Bilingual Internationalization (i18n ES/EN) with Strict Typing

### Status
**Accepted**

### Context and Problem Statement
Revolt Pass must operate natively in Spanish and English without jeopardizing 2FA secret privacy, incurring runtime bundle bloat, or relying on external cloud translation APIs that breach the Zero-Knowledge paradigm.

### Decision
1. **Client-Side Compiled Synchronous Dictionaries:** Implement static TypeScript translation dictionaries in `src/i18n/locales/es.ts` and `en.ts`, packaged directly into the client bundle with zero network latency.
2. **Strict Build-Time Typing:** Using `TranslationSchema` and typed dot-notation keys (`TranslationKey`), any missing translation key in either language or interpolation parameter mismatch (`{{count}}`, `{{issuer}}`) triggers a build error during `tsc -b`.
3. **Secure Local Persistence:** Language preferences persist in `localStorage.revolt_lang` with automatic browser language detection fallback and zero external telemetry.

---

## ADR-008: Multi-Device Lifecycle, Granular Session Revocation, and Remote FIDO2 Passkey Deletion

### Status
**Accepted**

### Context and Problem Statement
When a user logs out remotely from a shared or external workstation, if the platform authenticator (Windows Hello or biometric sensor) retains a registered Passkey, a local user could attempt re-authentication. Furthermore, users require clear, custom naming to identify each device and credential.

### Decision
1. **Decoupled Sessions and Passkeys in D1:** Model independent `sessions` and `passkeys` tables in Cloudflare D1.
2. **Granular Remote Revocation:** Dedicated endpoints `DELETE /api/auth/sessions/:id` and `DELETE /api/passkeys/:id` permit remote session termination and biometric credential deletion, neutralizing unauthorized re-entry on remote machines.
3. **Permanent Dual-Layer Name Persistence:** User-assigned names persist concurrently in D1 and IndexedDB `LocalUserConfig`, with backend upsert/touch SQL queries conditionally preserving existing custom names.

---

## ADR-009: Adoption of GNU AGPLv3 License with Strict Trademark & Brand Assets Policy

### Status
**Accepted**

### Context and Problem Statement
The project owner seeks to release Revolt Pass to the open-source community for cryptographic auditability and sovereign self-hosting, while strictly ensuring:
1. Third parties cannot take the codebase proprietary, commercialize closed-source derivatives, or sell SaaS services without contributing changes back.
2. Third parties cannot pass off the application as their own (preventing unauthorized white-labeling or brand dilution).

### Decision
1. **GNU Affero General Public License v3.0 (AGPLv3):** Strong copyleft license requiring anyone operating a network service or distributing modified versions of Revolt Pass to make the complete corresponding source code available under AGPLv3.
2. **Trademark & Brand Assets Policy (Section 7(e)):** Expressly declines to grant trademark rights for "Revolt", "Revolt Group", "Revolt Pass", logos, and domain names. Any fork or derivative work is legally required to rebrand with distinct names and replace all official visual branding.

---

## ADR-010: Decoupled Private Instance Mode and Community Self-Hosting (`VITE_PRIVATE_INSTANCE`)

### Status
**Accepted**

### Context and Problem Statement
Revolt Pass is distributed as free, open-source software under the GNU AGPLv3 license to empower any individual or organization to self-host their own sovereign 2FA vault on Cloudflare Workers and D1.
However, in the official production deployment operated by the project owner, the service is reserved exclusively for personal use. The application must:
1. Strictly restrict public self-registration on the owner's hosted instance without exposing private metadata or backend internal errors.
2. Avoid hardcoding proprietary barriers or schema restrictions into the open-source repository that would degrade or break the experience for community self-hosters.
3. Provide an unobtrusive, client-side unlock mechanism allowing the legitimate vault owner to access registration or login forms on new devices or incognito sessions.

### Evaluated Alternatives
1. **Hardcoding single-user restrictions into `schema.sql` or frontend source code:** Impairs community adoption by requiring third-party users to manually edit core source files just to make self-hosting work.
2. **Server-side whitelisting via Cloudflare Access / Zero Trust:** Introduces external paid dependencies, vendor lock-in, and configuration overhead incompatible with lightweight Zero-Knowledge client architecture.
3. **Decoupling via build-time environment variable (`VITE_PRIVATE_INSTANCE`) + remote D1 database trigger:** Keeps the public repository 100% open by default (`VITE_PRIVATE_INSTANCE=false`), while allowing private instances to enforce UI restrictions via `.env.local` and database-level invariants via a remote `BEFORE INSERT` trigger.

### Decision
Adopt **Private Instance Decoupling via `VITE_PRIVATE_INSTANCE` and Remote D1 Trigger**:
1. **Open-Source Default Configuration:** In `.env.example` and tracked repository code, `VITE_PRIVATE_INSTANCE=false`. Community users who clone the repository immediately obtain a fully functional, open multi-user instance for their family or personal infrastructure.
2. **Restricted Access Visual Overlay:** When `VITE_PRIVATE_INSTANCE=true` is supplied, unauthenticated visitors without a local vault profile encounter a full-screen blurred `Restricted Access Overlay` with all background registration inputs disabled and dimmed.
3. **Discrete Owner Unlock Shortcuts:** The owner can dismiss the restricted overlay at any time via capture-phase keyboard shortcuts (`Ctrl + Shift + U` or `Ctrl + Alt + U`) or by performing a triple-click on the central security shield icon.
4. **Backend Defense-in-Depth:** On the owner's remote production database, an SQLite trigger rejects unauthorized new account insertions directly at the storage engine level, providing zero-trust enforcement even if client-side code is tampered with.

---

## ADR-011: Preventive Hygiene Diagnostics and Breach Detection via k-Anonymity

### Status
**Accepted**

### Context and Problem Statement
Users store TOTP secrets and passwords that may have been compromised in public data breaches or configured with weak entropy. The system needs to proactively alert users to compromised credentials and hygiene risks without ever transmitting full passwords, secrets, or complete hashes to the server or third-party APIs.

### Decision
1. **k-Anonymity with HaveIBeenPwned (HIBP):** Calculate the SHA-1 hash of the credential client-side. Only the first 5 hexadecimal characters (*hash prefix*) are transmitted via a Cloudflare Worker edge proxy. The external service returns candidate suffixes with breach frequencies. The final suffix matching occurs 100% locally in client memory.
2. **Local Hygiene Diagnostics:** Bit-entropy calculations on Base32 secrets, duplicate detection, and backup obsolescence alerts (>30 days) execute purely client-side without sending telemetry.

---

## ADR-012: Perimeter Hardening (CSP, Rate Limiting, CORS) and Sliding Session Rotation

### Status
**Accepted**

### Context and Problem Statement
To mitigate XSS injection vectors, credential stuffing or user enumeration attacks on authentication endpoints, and persistent session hijacking over untrusted networks, the perimeter boundary on Cloudflare Workers requires robust hardening.

### Decision
1. **Strict Content-Security-Policy (CSP):** Immutable CSP headers emitted by the Worker preventing unauthorized script execution, external domain connections, and iframe embedding (`frame-ancestors 'none'`).
2. **Perimeter Rate Limiting:** Enforce 10 requests/minute on `/api/auth/salt` and `/api/auth/register`, returning `HTTP 429 Too Many Requests` with a `Retry-After` header.
3. **Restrictive CORS:** `Access-Control-Allow-Origin` headers bound to `env.APP_DOMAIN` in production.
4. **Sliding Session Token Rotation with Grace Window (`prev_token_hash`):** The session token is rotated on vault sync requests. To tolerate network concurrency across parallel requests or multiple browser tabs, Cloudflare D1 retains the preceding token hash in `prev_token_hash` during a sliding grace window.

---

## ADR-013: Native Protobuf Mass Ingestion, Differential Reconciliation, and Open Exporters

### Status
**Accepted**

### Context and Problem Statement
Migration from existing 2FA providers (Google Authenticator, Bitwarden, Aegis, 2FAS, etc.) often suffers from friction, uncontrolled duplicate generation, and critical recovery code data loss.

### Decision
1. **Native Pure TypeScript Protobuf Decoder:** Implemented a standalone parser for Google Authenticator's binary payload `otpauth-migration://offline?data=...` without heavy external dependencies.
2. **Three-Way Reconciliation Dialog:** Differential preview (`new`, `duplicate`, `conflict`) with user-selectable strategies (`keep existing`, `overwrite`, `keep both`) and automated recovery code merging.
3. **Open Universal Exporters:** Full vault backups exportable in Aegis JSON, Bitwarden CSV, `otpauth://` URI lists, and Google Authenticator Protobuf QR carousel for maximum interoperability.

---

## ADR-014: Adoption of ECDH P-384 for Item Key Sharing

### Status
**Accepted**

### Context and Problem Statement
Revolt Pass is fundamentally a single-user personal vault. However, team and organizational workflows inevitably require sharing specific secrets (e.g. organizational GitHub TOTP seeds, production access keys). Sharing these credentials via external channels (chat, email, documents) breaches the Zero-Knowledge security model. Revolt Pass requires a mechanism to securely share individual vault items between accounts such that Cloudflare D1 never gains access to plaintext secrets or decryption keys.

### Evaluated Alternatives
1. **Re-encrypting item secrets with the recipient's master key:**
   - Requires sender to know the recipient's master key. Violates Zero-Knowledge completely. **Rejected.**
2. **Pre-Shared Symmetric Key (PSK):**
   - Relies on out-of-band key distribution. Lacks lifecycle management and scalable revocation. **Rejected.**
3. **RSA-OAEP for key encapsulation:**
   - RSA-2048 is legacy; RSA-4096 incurs substantial payload bloat and Web Crypto API context limitations. **Rejected.**
4. **ECDH P-384 with HKDF-SHA256 and AES-256-GCM wrapping (Selected Option):**
   - Each user generates an asymmetric ECDH key pair on the NIST P-384 curve natively supported in Web Crypto API.
   - The user's private key remains encrypted inside their personal vault.
   - The public key is published to D1 and queryable by authenticated users.
   - The sender derives an ECDH shared secret using their private key and the recipient's public key. HKDF-SHA256 derives an AES-256-GCM `wrapping_key` to encapsulate the item's unique symmetric `item_key`.
   - Cloudflare D1 stores only the encrypted item ciphertext and the wrapped item key.

### Decision
Adopt **ECDH P-384 with HKDF-SHA256 key derivation and AES-256-GCM key encapsulation** (standard native Web Crypto ECIES scheme).
- The architecture is 100% Zero-Knowledge regarding item contents: D1 only observes relational metadata and ciphertext blobs.
- Establishes a mandatory architectural dependency on Milestone v2.0 to implement the per-item symmetric key model (`encrypted_key`).
