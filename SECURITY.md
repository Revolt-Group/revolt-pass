# Security Policy

> **Language Notice:** This is the primary security policy in English. You can also read the Spanish version: **[Versión en Español (SECURITY.es.md)](./SECURITY.es.md)**.

The security of your cryptographic secrets and 2FA tokens is the foundational priority of **Revolt Pass**. We take all security vulnerabilities seriously and appreciate the assistance of security researchers and the open-source community in responsibly disclosing potential weaknesses.

---

## 🛡️ Supported Versions

Only the latest active minor release receives security patches and proactive vulnerability triage:

| Version | Supported          | Status |
| :------ | :----------------- | :----- |
| `1.2.x` | :white_check_mark: | Currently Supported & Maintained |
| `< 1.2` | :x:                | End of Life (Upgrade Recommended) |

---

## 🔐 Reporting a Vulnerability

If you discover a security vulnerability or cryptographic flaw in Revolt Pass, **please do NOT report it via public GitHub issues, discussions, or pull requests.**

Instead, please use one of our confidential reporting channels:

### 1. GitHub Private Vulnerability Reporting (Recommended)
You can report vulnerabilities directly and securely through our repository:
1. Navigate to the **Security** tab of this repository.
2. Under **Reporting**, click on **Report a vulnerability**.
3. Fill out the advisory form with detailed reproduction steps, technical analysis, and impact assessment.

### 2. Direct Security Email
If you prefer email or do not have a GitHub account, you can send an encrypted or plain report to:
* **Email:** `dev@revoltgroup.com.ar`
* **Subject Line:** `[SECURITY] Vulnerability Report: Revolt Pass`

---

## ⏱️ Response & Disclosure Timelines

We adhere to coordinated responsible disclosure standards:
* **Initial Acknowledgment:** Within **48 hours** of report receipt.
* **Triage & Validation:** Within **5 business days**, confirming reproduction and risk severity (CVSS v3.1).
* **Fix & Release:** We prioritize high/critical vulnerabilities and aim to deliver a patched release within **30 days**.
* **Public Advisory:** A coordinated security advisory will be published upon release of the fix, crediting the researcher (unless anonymity is requested).

Please allow us reasonable time to investigate and remediate before publicly disclosing any details.

---

## 🎯 Scope

### In-Scope
* **Client-Side Cryptography:** Implementation flaws in WebCrypto primitives, AES-256-GCM mode, PBKDF2-HMAC-SHA256 (600,000 iterations), WebAuthn PRF wrapping, or entropy generation.
* **Authentication & Authorization:** Session token forgery, replay attacks, broken access control, or privilege escalation on `/api/*` Cloudflare Worker endpoints.
* **Memory & Storage Hygiene:** Plaintext secret leakage in IndexedDB, `localStorage`, application logs, un-cleared clipboard buffers, or persistent RAM retention after vault lock.
* **Cross-Site Scripting (XSS) / Injection:** Vulnerabilities allowing malicious code execution within the authenticated PWA origin.

### Out-of-Scope
* Attacks requiring physical control, local root/administrator compromise, or pre-existing malware/keyloggers on the client operating system.
* Volumetric Denial of Service (DoS / DDoS) against Cloudflare's edge infrastructure.
* Social engineering or phishing targeting end-users.
* Attacks against outdated, unsupported browsers that lack standard WebCrypto or WebAuthn API implementations.

---

## 🏛️ Zero-Knowledge Threat Model

Revolt Pass is designed from the ground up as a **Zero-Knowledge Architecture**:
1. All encryption and decryption operations take place strictly within the client browser/PWA.
2. The server (Cloudflare Worker + D1 SQLite) only stores opaque base64-encoded encrypted blobs (`vault_data`), random salts, and authentication hashes.
3. Neither your Master Password nor your Master Key is ever transmitted across the network or stored in database tables.
4. In the theoretical event of a full server database compromise, attackers obtain only AES-256-GCM ciphertexts computationally infeasible to break without user master passphrases.

For complete mathematical formulations, STRIDE threat matrices, and cryptographic flow diagrams, see our comprehensive engineering guide:
* **[03-SECURITY-AND-THREAT-MODEL.md](./docs/en/03-SECURITY-AND-THREAT-MODEL.md)** (*or [Versión en Español](./docs/es/03-SECURITY-AND-THREAT-MODEL.md)*).
