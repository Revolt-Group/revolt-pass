<p align="right">
  <a href="./README.md">Español</a> | <strong>English</strong>
</p>

# Revolt Pass — Zero-Knowledge 2FA & Security Vault

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![Version: v1.5.0](https://img.shields.io/badge/Version-v1.5.0-blue.svg)](./CHANGELOG.md)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict_6.0-blue.svg)](#)
[![Vite: v8](https://img.shields.io/badge/Vite-v8-646CFF.svg)](#)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg)](#)
[![Tailwind: v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](#)
[![Cloudflare: Workers_%2B_D1](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020.svg)](#)
[![Tests: 134/134](https://img.shields.io/badge/Tests-134%2F134_Passing-brightgreen.svg)](#)

> Enterprise-grade cybersecurity Progressive Web App (PWA) designed under a **Zero-Knowledge** cryptographic architecture for sovereign management of two-factor authentication (TOTP - RFC 6238), structured recovery codes storage, **Argon2id WASM (64 MB)** key derivation with silent background auto-migration, **Web Push RFC 8291/8292** and **BYOK Email (Resend / Cloudflare)** proactive security alerts, universal individual account QR viewer, Google Authenticator batch QR migration carousel, universal cross-platform importers (Authy, Bitwarden, Aegis, 1Password, etc.), physical YubiKey/FIDO2 roaming keys, proactive vault health diagnostics, k-Anonymity breach detection (HaveIBeenPwned), edge hardening (CSP, Rate Limiting, token rotation), and native biometric hardware unlock (Windows Hello / FIDO2 Passkeys).

---

## 🌟 Key Features

* **Argon2id KDF & Proactive Zero-Knowledge Alerts (v1.5.0):**
  - **Argon2id WASM:** Memory-hard master key derivation (64 MB, 3 rounds) compiled to WebAssembly via `hash-wasm`, impervious to GPU/ASIC cluster cracking. Features seamless, silent background auto-upgrade of legacy PBKDF2 vaults on next login or unlock, re-encrypting the vault and re-wrapping biometric Passkeys.
  - **Native Web Push ($0 Operating Cost):** Real-time push security notifications direct from Cloudflare Workers to browser push services via native Push API, Service Worker, and RFC 8291/8292 (VAPID + AES-128-GCM). Alerts on logins from unrecognized countries, new active sessions, remote revocations, and added passkeys.
  - **BYOK Email Alerts (Bring Your Own Key):** Zero-cost email security notifications utilizing user's personal free-tier Resend API key (3,000 emails/month free) or Cloudflare Email (`send_email`). Dedicated Notifications tab in the Security Modal with instant test buttons.
* **Multi-Account QR Carousel Exporter & Individual QR Viewer (v1.4.1):** Pure TypeScript Protocol Buffers encoder generating official `otpauth-migration://offline?data=...` migration URIs divided into optimal batches of 7 accounts per QR code with an interactive carousel to absorb your entire vault using Google Authenticator, Aegis, or 2FAS cameras. High-definition vector SVG QR viewer to transfer individual accounts with any mobile authenticator (`otpauth://`).
* **Universal Importers & Open Vault Exporters (v1.4.0):** Frictionless zero-knowledge migration from Google Authenticator (pure TypeScript Protobuf decoder), Authy, Aegis, 2FAS, Bitwarden, 1Password, Proton Pass, Ente Auth, LastPass, and `otpauth://` URI lists. Interactive smart reconciliation engine with diff preview (*new, duplicate, conflict*) and selectable resolution strategies (*keep existing, overwrite, keep both*). Open export to Aegis JSON, Bitwarden CSV, and `otpauth://` list formats. WebAuthn support for physical hardware security keys (**YubiKey / FIDO2 Roaming**) and CSV/JSON security audit log export.
* **Client-Side Zero-Knowledge Encryption:** Authenticated symmetric **256-bit AES-GCM** encryption with a fresh initialization vector (`IV`) per save operation, alongside master key derivation via **Argon2id / PBKDF2 (600,000 rounds)** running in a dedicated Web Worker.
* **Edge Security Hardening & Defense-in-Depth (v1.3.1):** Strict Content-Security-Policy (CSP) headers mitigating XSS attacks (VEC-06), Cloudflare Workers native rate limiting preventing user enumeration and registration spam, domain-scoped CORS matching `APP_DOMAIN`, and automatic sliding session token rotation on every vault sync.
* **Vault Health, Cryptographic Hygiene & k-Anonymity Leak Checker (v1.3):** Real-time client-side security diagnostic with an interactive Scorecard (0-100%), detection of weak Base32 secrets (<80 bits), duplicate secrets reused across services, backup freshness monitoring (>30 days), and HaveIBeenPwned data breach detection backed by mathematical Zero-Knowledge k-Anonymity (only 5 hex chars of SHA-1 sent to the proxy with padding).
* **Serverless Edge Infrastructure (\$0 Operating Cost):** Lightning-fast bidirectional synchronization powered by **Cloudflare Workers** and the distributed database **Cloudflare D1 (Serverless SQLite)**, operating 100% within Cloudflare's free tier.
* **Bilingual Internationalization (i18n ES / EN):** Complete English and Spanish support without third-party cloud translation APIs or privacy leaks, featuring typed client-side compiled dictionaries and instant dynamic switching.
* **Security & Sessions Panel:** Real-time monitoring of active devices and sessions, persistent custom device naming, and individual remote session termination.
* **Fast Hardware Unlock & Passkeys Management (WebAuthn Level 3):** Native support for **Windows Hello (PIN or biometrics)** on desktop PCs/laptops, and **Touch ID / Face ID** on mobile devices. Management panel for viewing, naming, and remotely revoking Passkeys to prevent unauthorized re-entry on shared workstations.
* **100% Offline-First:** The entire vault is stored locally encrypted in **IndexedDB** (`idb`). You can view accounts, generate TOTP codes, and manage backups completely offline. Upon reconnecting, the sync engine automatically reconciles pending changes (*Last-Write-Wins* per item).
* **Atomic Time Drift Compensation:** Continuous clock synchronization against Cloudflare's atomic UTC time, eliminating token rejections caused by device clock desynchronization.
* **Structured Recovery Codes Management:** Bulk pasting of backup codes (e.g. 8 or 10 codes at once), status tracking (used / available), secure one-click copying, and 45-second automatic clipboard clearing.
* **Custom Account Logos & Photos:** Upload local images, paste direct HTTPS URLs, or paste screenshots directly from the clipboard (`Ctrl + V`), with automatic client-side canvas compression to 96x96 px WebP (~2 KB) encrypted inside the vault.
* **Installable PWA:** Service Worker with Workbox for aggressive static asset caching, fully installable as a standalone desktop app on Windows/macOS and mobile app on Android/iOS.

---

## 🚀 Quickstart & Self-Hosting

Deploying your own sovereign, private instance of Revolt Pass on Cloudflare takes less than 3 minutes:

### 1. Clone the repository and install dependencies
```bash
git clone https://github.com/Revolt-Group/revolt-pass.git
cd revolt-pass
pnpm install
```

### 2. Log in to Cloudflare CLI
```bash
pnpm wrangler login
```

### 3. Create the Cloudflare D1 Database
```bash
pnpm wrangler d1 create revolt-pass-db
```
The command outputs a unique `database_id` (UUID).

### 4. Configure `wrangler.toml`
Copy the configuration template:
```bash
cp wrangler.toml.example wrangler.toml
```
Edit `wrangler.toml` and paste your `database_id` into the corresponding section:
```toml
[[d1_databases]]
binding = "DB"
database_name = "revolt-pass-db"
database_id = "<PASTE_YOUR_DATABASE_ID_HERE>"
```

### 5. Configure Frontend Environment Variables (`.env.local`)
Copy the environment variables template:
```bash
cp .env.example .env.local
```
By default, `VITE_PRIVATE_INSTANCE=false` (open mode, ideal for self-hosters or families where anyone on your server can register an isolated vault). If you want to disable public registration and lock the instance exclusively to your personal vault, set `VITE_PRIVATE_INSTANCE=true`.

### 6. Apply database migrations
```bash
pnpm wrangler d1 execute revolt-pass-db --file=schema.sql --remote
```

### 7. Build and Deploy
```bash
pnpm build
pnpm wrangler deploy
```
That's it! Cloudflare will grant you an active URL (e.g. `https://revolt-pass.<your-cloudflare-subdomain>.workers.dev`), or you can attach your custom domain in the Worker settings.

---

## 🏛️ Engineering Documentation Suite

The complete and canonical technical specification is available in Spanish and English:

| Document (English) | Documento (Español) | Description / Descripción |
| :--- | :--- | :--- |
| **[01-PRD.md](./docs/en/01-PRD.md)** | **[01-PRD.md](./docs/es/01-PRD.md)** | Product Requirements, Scope & Engineering KPIs |
| **[02-ARCHITECTURE.md](./docs/en/02-ARCHITECTURE.md)** | **[02-ARCHITECTURE.md](./docs/es/02-ARCHITECTURE.md)** | C4 Architecture, End-to-End Data Flows & D1 Schema |
| **[03-SECURITY-AND-THREAT-MODEL.md](./docs/en/03-SECURITY-AND-THREAT-MODEL.md)** | **[03-SECURITY-AND-THREAT-MODEL.md](./docs/es/03-SECURITY-AND-THREAT-MODEL.md)** | Cryptography, STRIDE Threat Model & Memory Hygiene |
| **[04-ADRS.md](./docs/en/04-ADRS.md)** | **[04-ADRS.md](./docs/es/04-ADRS.md)** | Architecture Decision Records (ADR-001 to ADR-014) |
| **[05-ROADMAP.md](./docs/en/05-ROADMAP.md)** | **[05-ROADMAP.md](./docs/es/05-ROADMAP.md)** | Sequential Phases Execution Plan & Definition of Done |

---

## 🛠️ Development Commands

```bash
# Start frontend development server (Vite)
pnpm dev

# Run complete test suite (Vitest)
pnpm test

# Build and strict TypeScript typechecking
pnpm build

# Run Worker and D1 database locally
pnpm wrangler dev
```

---

## 🤝 Contributing & Security

We welcome community contributions. Please review our **[English Contributing Guide](./CONTRIBUTING.md)** (*o la [Guía de Contribución en Español](./CONTRIBUTING.es.md)*) before opening a Pull Request.

### 🔒 Security Policy & Responsible Disclosure
To report security vulnerabilities, please **DO NOT open a public issue**. Use GitHub's **Private Vulnerability Reporting** feature or review our complete security policy in **[SECURITY.md](./SECURITY.md)** (*or [Versión en Español](./SECURITY.es.md)*).

---

## 📄 License & Trademark Policy
 
This project is free software licensed under the **[GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE)**. See the [`LICENSE`](./LICENSE) file for the full legal text.

### 🛡️ Trademark & Brand Assets Policy
While the underlying source code is open, the names **"Revolt"**, **"Revolt Group"**, **"Revolt Pass"**, the official logos, icons, graphics, and associated domain names are protected trademarks and assets of **Revolt Group**:
* **Disallowed Usage:** No trademark license is granted to use these names or logos in forks, modified versions, or commercial offerings without explicit prior written authorization.
* **Forks & Derivatives:** If you build or distribute a modified version or hosted service based on this code, Section 7(e) of the AGPLv3 requires that you rebrand the software with a distinct name and replace all official logos and graphic branding.
* **Attribution:** You must preserve all original copyright notices, contributor credits, and author attributions in accordance with Sections 7(b) and 7(c) of the AGPLv3.
