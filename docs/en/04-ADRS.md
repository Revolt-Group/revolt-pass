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
