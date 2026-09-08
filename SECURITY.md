# Security Policy

> **Language Notice:** This is the primary security policy in English. You can also read the Spanish version: **[Versión en Español (SECURITY.es.md)](./SECURITY.es.md)**.

The security of your cryptographic secrets and 2FA tokens is the foundational priority of **Revolt Pass**. We take all security vulnerabilities seriously and appreciate the assistance of security researchers and the open-source community in responsibly disclosing potential weaknesses.

---

## 🛡️ Supported Versions

Only the latest active minor release receives security patches and proactive vulnerability triage:

| Version | Supported          | Status |
| :------ | :----------------- | :----- |
| `2.0.x` | :white_check_mark: | Currently Supported & Maintained (Polymorphic Suite, Envelope Wrapping, D1 Snapshots, Emergency Kit) |
| `1.5.x` | :white_check_mark: | Maintained (Argon2id + Web Push) |
| `< 1.5` | :x:                | End of Life (Upgrade Recommended) |

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
* **Client-Side Cryptography:** Implementation flaws in WebCrypto / WASM primitives, AES-256-GCM mode, Argon2id (64 MB RAM, 3 iterations) / PBKDF2-HMAC-SHA256 (600,000 iterations), per-item envelope encryption (`item_key` symmetrically wrapped under Master Key), WebAuthn key wrapping, RFC 8291/8292 Web Push encryption (AES-128-GCM + ECDH P-256 + VAPID), or entropy generation.
* **Authentication, Authorization & Snapshots:** Session token forgery, replay attacks, broken access control, version tampering, or privilege escalation on `/api/*` Cloudflare Worker endpoints (including `/api/vault/snapshots` and `/api/vault/restore/:vault_version`).
* **Memory, Trash & Storage Hygiene:** Plaintext secret leakage in IndexedDB, `localStorage`, application logs, un-cleared clipboard buffers, improper data retention after item deletion (cryptographic shredding after 30 days), or persistent RAM retention after vault lock.
* **Emergency Kit Generation:** Plaintext secret leakage during physical Emergency Kit generation and printing (the kit must be generated 100% client-side and offline without sending master passwords or unencrypted payloads to cloud print services).
* **Cross-Site Scripting (XSS) / Injection:** Vulnerabilities allowing malicious code execution within the authenticated PWA origin.

### Out-of-Scope
* Attacks requiring physical control, local root/administrator compromise, or pre-existing malware/keyloggers on the client operating system.
* Volumetric Denial of Service (DoS / DDoS) against Cloudflare's edge infrastructure.
* Social engineering or phishing targeting end-users.
* Attacks against outdated, unsupported browsers that lack standard WebCrypto or WebAuthn API implementations.

---

## 🏛️ Zero-Knowledge Threat Model

Revolt Pass is designed from the ground up as a **Zero-Knowledge Architecture**:
1. All encryption and decryption operations take place strictly within the client browser/PWA via WebCrypto API and Argon2id WASM.
2. Every item in the vault possesses its own independent symmetric key (`item_key`), wrapped under the user's master key before serialization into the overall vault payload.
3. The server (Cloudflare Worker + D1 SQLite) only stores opaque base64-encoded encrypted blobs (`vault_data`), historical snapshots encrypted under the identical zero-knowledge scheme, random salts, and authentication hashes.
4. Neither your Master Password, nor your derived Master Key, nor your Emergency Kit plaintext data is ever transmitted across the network or stored in database tables.
5. In the theoretical event of a full server database compromise or snapshot dump, attackers obtain only AES-256-GCM ciphertexts computationally infeasible to break without user master passphrases.

For complete mathematical formulations, STRIDE threat matrices, and cryptographic flow diagrams, see our comprehensive engineering guide:
* **[03-SECURITY-AND-THREAT-MODEL.md](./docs/en/03-SECURITY-AND-THREAT-MODEL.md)** (*or [Versión en Español](./docs/es/03-SECURITY-AND-THREAT-MODEL.md)*).
