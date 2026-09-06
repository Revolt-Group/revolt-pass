<p align="right">
  <a href="./README.md">Español</a> | <strong>English</strong>
</p>

# Revolt Pass — Zero-Knowledge 2FA & Security Vault

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict_6.0-blue.svg)](#)
[![Vite: v8](https://img.shields.io/badge/Vite-v8-646CFF.svg)](#)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg)](#)
[![Tailwind: v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](#)
[![Cloudflare: Workers_%2B_D1](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020.svg)](#)
[![Tests: 73/73](https://img.shields.io/badge/Tests-73%2F73_Passing-brightgreen.svg)](#)

> Enterprise-grade cybersecurity Progressive Web App (PWA) designed under a **Zero-Knowledge** cryptographic architecture for sovereign management of two-factor authentication (TOTP - RFC 6238), structured recovery codes storage, custom logos with client-side compression, bilingual internationalization (ES/EN), and native biometric hardware unlock (Windows Hello / FIDO2 Passkeys).

---

## 🌟 Key Features

* **Client-Side Zero-Knowledge Encryption:** Authenticated symmetric **256-bit AES-GCM** encryption with a fresh initialization vector (`IV`) per save operation, alongside master key derivation via **Argon2id / PBKDF2 (600,000 rounds)** running in a dedicated Web Worker.
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

### 5. Apply database migrations
```bash
pnpm wrangler d1 execute revolt-pass-db --file=schema.sql --remote
```

### 6. Build and Deploy
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
| **[04-ADRS.md](./docs/en/04-ADRS.md)** | **[04-ADRS.md](./docs/es/04-ADRS.md)** | Architecture Decision Records (ADR-001 to ADR-006) |
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

## 🤝 Contributing

We welcome community contributions. Please review our **[English Contributing Guide](./CONTRIBUTING.md)** (*o la [Guía de Contribución en Español](./CONTRIBUTING.es.md)*) before opening a Pull Request or reporting security vulnerabilities.

---

## 📄 License & Trademark Policy
 
This project is free software licensed under the **[GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE)**. See the [`LICENSE`](./LICENSE) file for the full legal text.

### 🛡️ Trademark & Brand Assets Policy
While the underlying source code is open, the names **"Revolt"**, **"Revolt Group"**, **"Revolt Pass"**, the official logos, icons, graphics, and associated domain names are protected trademarks and assets of **Revolt Group**:
* **Disallowed Usage:** No trademark license is granted to use these names or logos in forks, modified versions, or commercial offerings without explicit prior written authorization.
* **Forks & Derivatives:** If you build or distribute a modified version or hosted service based on this code, Section 7(e) of the AGPLv3 requires that you rebrand the software with a distinct name and replace all official logos and graphic branding.
* **Attribution:** You must preserve all original copyright notices, contributor credits, and author attributions in accordance with Sections 7(b) and 7(c) of the AGPLv3.
