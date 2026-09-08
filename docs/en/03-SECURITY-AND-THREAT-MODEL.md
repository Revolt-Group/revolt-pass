# Cryptographic Specification & Threat Model
## Project: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadata | Detail |
| :--- | :--- |
| **Identificador de Documento / Document Identifier** | `RP-SEC-003` |
| **Version** | `2.0.0-PROD (v2.5 Scope Ready)` |
| **Status** | Approved / Cryptographic Grade Security Specification |
| **Frameworks & Standards** | OWASP ASVS v4.0, NIST SP 800-63B, RFC 6238, RFC 5869, RFC 9106 (Argon2), RFC 8291, RFC 8292, W3C WebAuthn Level 3 |
| **Production Domain** | `https://<your-domain-or-subdomain>.workers.dev` |
| **License** | GNU AGPLv3 + Revolt Group Trademark Policy |

---

## 1. Formal Cryptographic Specification

Revolt Pass adheres to the **Zero-Knowledge** cryptographic paradigm. All operations including entropy generation, key derivation, symmetric encryption, and integrity verification occur exclusively within the client execution environment via the **Web Crypto API** (`window.crypto.subtle`) and sandboxed WebAssembly modules, ensuring user-space cryptographic computation remains tamper-proof.

### 1.1 Master Key Derivation (Key Derivation Function - KDF)

Starting with **v1.5.0**, Revolt Pass mandates **Argon2id** (RFC 9106) as the default Key Derivation Function for all newly registered vaults, while retaining backward compatibility for legacy **PBKDF2-HMAC-SHA256** accounts through a transparent, atomic silent auto-upgrade pipeline.

#### 1.1.1 Canonical Argon2id Parameters (Default)
Executed via high-performance WebAssembly (`hash-wasm`) isolated inside a dedicated **Web Worker** (`src/lib/crypto/kdf.worker.ts`) to avoid dropping frames on the main UI thread:

| Parameter | Canonical Value | Engineering Rationale / Standard |
| :--- | :--- | :--- |
| **Base Algorithm** | `Argon2id` (RFC 9106) | Winner of the Password Hashing Competition (PHC). Delivers balanced, state-of-the-art resistance against side-channel cache-timing attacks (Argon2i) and GPU/ASIC parallel brute-force (Argon2d). |
| **Memory Cost ($m$)** | **$64 \text{ MB}$ ($65,536 \text{ KiB}$)** | Strictly conforms to OWASP 2024 Password Storage Cheat Sheet recommendations. Forces massive per-guess physical memory allocation, neutralizing distributed GPU/ASIC cracking arrays. |
| **Time Iterations ($t$)** | **$3$ rounds** | Optimal trade-off between cryptographic work factor and client unlock latency (~200-400 ms in WebAssembly on mobile and desktop). |
| **Parallelism ($p$)** | **$1$ thread (lane)** | Tailored for predictable execution and deterministic resource limits within browser Web Worker contexts. |
| **Salt (Salting)** | $128 \text{ bits}$ ($16 \text{ bytes}$) random | Cryptographically generated via `crypto.getRandomValues(new Uint8Array(16))`. Unique per user, preventing rainbow table attacks. |
| **Derived Key Length** | $256 \text{ bits}$ ($32 \text{ bytes}$) | Exactly matches the length required for the symmetric `AES-GCM-256` key. |
| **Key Exportability** | `extractable: false` | The `CryptoKey` created in volatile RAM is imported as non-extractable by JavaScript. |

#### 1.1.2 Legacy Algorithm and Silent Auto-Upgrade (PBKDF2)
For accounts provisioned prior to v1.5.0, the platform preserves support for **PBKDF2-HMAC-SHA256** at **600,000 rounds** (RFC 8018).

* **Seamless Silent Auto-Upgrade:** The moment a user with a legacy PBKDF2 account unlocks their vault or logs in, the client detects the legacy KDF metadata, immediately derives the new master key using **Argon2id (64 MB, 3 rounds)** with a newly generated cryptographic salt, re-encrypts the vault ciphertext and any enrolled WebAuthn passkeys, and commits the upgrade atomically via `POST /api/auth/upgrade-kdf`. The user experiences immediate hardening with zero prompts or friction.

To prevent blocking the main DOM thread, all KDF derivations (both Argon2id and PBKDF2) run exclusively off-thread in the isolated **Web Worker**.

---

### 1.2 Symmetric Encryption and Vault Authentication (AES-GCM)
The vault payload (list of TOTP accounts, Base32 secrets, recovery codes, and metadata) is serialized into a UTF-8 JSON string and processed using **AES-GCM (Advanced Encryption Standard in Galois/Counter Mode)**.

```mermaid
flowchart LR
    subgraph EncryptionFlow ["AES-GCM-256 Encryption Flow"]
        Plaintext["Plaintext JSON\n(VaultItem[])"]
        IV["CSPRNG 96-bit IV\n(12 random bytes)"]
        MasterKey["CryptoKey\n(AES-GCM 256-bit)"]
        
        AES["Web Crypto Engine\nAES-GCM-256"]
        
        Ciphertext["Ciphertext\n+ Auth Tag (128-bit)"]
        Payload["Payload for D1:\n{ encrypted_blob, iv, version }"]
    end

    Plaintext --> AES
    IV --> AES
    MasterKey --> AES
    AES --> Ciphertext
    Ciphertext --> Payload
    IV --> Payload
```

* **Key Size:** 256 bits (`AES-256`).
* **Initialization Vector (IV / Nonce):** 96 bits (12 bytes). **Strict invariant:** A new IV is generated via `crypto.getRandomValues(new Uint8Array(12))` **on every save operation**. Nonce reuse under AES-GCM destroys authenticity and enables plaintext recovery.
* **Authentication Tag:** 128 bits (16 bytes). Provides strict cryptographic integrity: any 1-bit alteration in transit or at rest triggers an immediate `OperationError` during `subtle.decrypt()`, thwarting tampering attacks.

---

### 1.3 Rapid Unlock Mechanism via WebAuthn / Passkeys
To ensure a frictionless experience without breaking the Zero-Knowledge boundary, Revolt Pass implements a hardware-backed **Local Key Wrapping** scheme via WebAuthn / FIDO2.

1. **Enrollment:**
   * The user authenticates with Master Password (producing `MasterKey`).
   * The client calls `navigator.credentials.create()` with:
     * `authenticatorAttachment: "platform"` (restricts to local platform hardware: Windows Hello, Touch ID / Face ID, Android Biometrics).
     * `userVerification: "required"` (forces biometric scan or Windows Hello PIN).
   * Client generates a random 256-bit symmetric `DeviceWrappingKey`.
   * `MasterKey` is wrapped using `DeviceWrappingKey` via AES-GCM, yielding `wrapped_master_key`.
   * `DeviceWrappingKey` is persisted securely in local browser storage, tied to the WebAuthn credential ID.
2. **Subsequent Unlock:**
   * Application requests assertion with `navigator.credentials.get({ publicKey: { challenge, userVerification: "required" } })`.
   * User provides Windows Hello PIN or biometric touch.
   * Following hardware TPM/Enclave verification, client unlocks `DeviceWrappingKey`, decrypts `wrapped_master_key`, and reconstructs `MasterKey` in volatile RAM.
   * If the credential is revoked or verification fails, keys are purged and Master Password is required.

---

### 1.4 TOTP Engine (RFC 6238 / RFC 4226)
One-Time Password generation strictly follows IETF standards:

1. **Base32 Decoding (RFC 4648):**
   * Sanitizes secrets by stripping null characters, hyphens, and whitespace.
   * Pure TypeScript Base32 decoder with alphabet `[A-Z2-7]`.
2. **Interval Calculation:**
   $$C_t = \left\lfloor \frac{T_{local} + \Delta T_{drift}}{X} \right\rfloor$$
   where $X = 30$ seconds and $\Delta T_{drift}$ is the edge time synchronization delta. Counter serialized as 64-bit Big-Endian integer (8 bytes).
3. **HMAC Generation:**
   * Signs $C_t$ with secret using `crypto.subtle.sign("HMAC", hmacKey, counterBuffer)`.
   * Supports `SHA-1` (20 bytes default) and `SHA-256` (32 bytes).
4. **Dynamic Truncation:**
   * Last byte determines offset:
     $$\text{offset} = \text{hash}[20 - 1] \ \& \ \text{0x0F}$$
   * Extracts 4 bytes masking sign bit:
     $$\text{binary} = ((\text{hash}[\text{offset}] \ \& \ \text{0x7F}) \ll 24) \ | \ ((\text{hash}[\text{offset} + 1] \ \& \ \text{0xFF}) \ll 16) \ | \ ((\text{hash}[\text{offset} + 2] \ \& \ \text{0xFF}) \ll 8) \ | \ (\text{hash}[\text{offset} + 3] \ \& \ \text{0xFF})$$
   * Computes final code via modulo:
     $$\text{token} = (\text{binary} \pmod{10^{\text{digits}}}).\text{toString}().\text{padStart}(\text{digits}, \text{'0'})$$

---

### 1.5 Asymmetric Cryptography & Key Agreement (ECDH P-384 + HKDF-SHA256 - ADR-014)
To enable cryptographically secure secret sharing between individual users without leaking plaintext to Cloudflare D1 and without requiring out-of-band pre-shared keys, Revolt Pass implements an **Asymmetric Key Encapsulation Mechanism (KEM)** built on **ECDH P-384** and **HKDF-SHA256**.

```mermaid
flowchart TD
    subgraph SenderSide ["Sender (Item Owner)"]
        ItemKey["ItemKey\n(AES-256-GCM 256-bit)"]
        SenderPriv["Sender PrivKey\n(ECDH P-384 in RAM)"]
        RecipientPub["Recipient PubKey\n(Fetched from D1)"]
        
        ECDH1["Web Crypto subtle.deriveBits\nECDH P-384"]
        HKDF1["Web Crypto subtle.deriveKey\nHKDF-SHA256 (info: 'revolt-pass-shared-item-v1')"]
        WrapKey["Web Crypto subtle.wrapKey\nAES-256-GCM"]
        
        SenderPriv & RecipientPub --> ECDH1
        ECDH1 -->|Z: 48 bytes| HKDF1
        HKDF1 -->|WrappingKey: 256-bit| WrapKey
        ItemKey --> WrapKey
        WrapKey --> EncryptedItemKey["encrypted_item_key\n+ key_iv (12B) + auth_tag (16B)"]
    end

    subgraph Storage ["Cloudflare D1 (Zero-Knowledge)"]
        D1Record["shared_items table:\n- encrypted_item (encrypted with ItemKey)\n- encrypted_item_key (encrypted with WrappingKey)\n- ivs & relationship metadata"]
    end

    subgraph RecipientSide ["Recipient"]
        RecipientPriv["Recipient PrivKey\n(Decrypted from vault into RAM)"]
        SenderPub["Sender PubKey"]
        
        ECDH2["Web Crypto subtle.deriveBits\nECDH P-384"]
        HKDF2["Web Crypto subtle.deriveKey\nHKDF-SHA256 (same salt and info)"]
        UnwrapKey["Web Crypto subtle.unwrapKey\nAES-256-GCM"]
        DecryptItem["Web Crypto subtle.decrypt\nAES-256-GCM"]
        
        RecipientPriv & SenderPub --> ECDH2
        ECDH2 -->|Z: 48 bytes| HKDF2
        HKDF2 -->|WrappingKey| UnwrapKey
        EncryptedItemKey --> UnwrapKey
        UnwrapKey --> RecoveredItemKey["ItemKey recovered in RAM"]
        RecoveredItemKey --> DecryptItem
        DecryptItem --> PlaintextItem["Decrypted Item in volatile RAM\n(Never written to disk/IndexedDB)"]
    end

    EncryptedItemKey --> D1Record
    D1Record --> RecipientSide
```

#### Canonical Cryptographic Parameters:
1. **Elliptic Curve:** NIST P-384 (`secp384r1`). Provides a 192-bit cryptographic security strength (exceeding P-256 and aligned with CNSA/NSA Suite B specifications), natively supported in the Web Crypto API without external libraries.
2. **Key Pair Generation:**
   $$\text{KeyPair} = \text{crypto.subtle.generateKey}(\{ \text{name: "ECDH"}, \text{namedCurve: "P-384"} \}, \text{extractable: true}, [\text{"deriveKey"}, \text{"deriveBits"} ])$$
   * Public key is exported in `spki` format (Base64 encoded) and registered in Cloudflare D1 column `users.ecdh_public_key`.
   * Private key is exported in `pkcs8` format, symmetrically encrypted with user's `MasterKey`, and stored inside the user's `encrypted_blob` in IndexedDB. It is never exposed to the server in plaintext.
3. **Diffie-Hellman Shared Secret Agreement (ECDH):**
   $$\mathcal{Z} = \text{ECDH}(\text{PrivKey}_A, \text{PubKey}_B) \in \mathbb{F}_p \quad (48 \text{ bytes})$$
4. **Key Derivation Function (HKDF-SHA256 - RFC 5869):**
   From the shared secret $\mathcal{Z}$, a 256-bit symmetric `WrappingKey` is derived, ensuring context separation and key independence:
   $$\text{PRK} = \text{HMAC-SHA256}(\text{Salt}, \mathcal{Z})$$
   $$\text{WrappingKey} = \text{HKDF-Expand}(\text{PRK}, \text{"revolt-pass-shared-item-v1"}, 256 \text{ bits})$$
5. **Secret Encapsulation (Key Wrapping):**
   The item's symmetric key (`ItemKey`, AES-256-GCM) is wrapped using the derived `WrappingKey`:
    $$\text{EncryptedKey}, \text{KeyTag} = \text{AES-GCM-256-Wrap}(\text{WrappingKey}, \text{ItemKey}, \text{KeyIV})$$
    The item content is encrypted with the `ItemKey`:
    $$\text{EncryptedItem}, \text{ItemTag} = \text{AES-GCM-256-Encrypt}(\text{ItemKey}, \text{ItemJSON}, \text{ItemIV})$$

---

### 1.6 Proactive Zero-Knowledge Alerts: Web Push (RFC 8291/8292) and BYOK Email

To alert users immediately upon suspicious access patterns or session modifications without breaching confidentiality or incurring infrastructure costs:

#### 1.6.1 Native Web Push & Payload Encryption (RFC 8291 / RFC 8292)
1. **Client Subscription:** The browser registers a Push subscription bound to the instance's public VAPID key, exporting two cryptographic values: `p256dh` (user-agent public key on NIST P-256) and `auth` (16-byte shared authentication secret).
2. **Application Server Identification (VAPID - RFC 8292):** Cloudflare Workers generates an authorization JWT signed via ECDSA on NIST P-256 with SHA-256 (`ES256`), enabling direct push dispatch to operating system push backends (Google FCM, Apple APNs, Mozilla Push) without third-party push aggregators (Pusher, OneSignal).
3. **End-to-End Message Encryption (RFC 8291):** The notification payload is encrypted using `aes128gcm` with keys derived via ephemeral ECDH (P-256) and HKDF. Intermediary OS push relays act strictly as blind relays, mathematically incapable of reading notification plaintext.
4. **Content Hygiene:** Push notifications never include vault secrets, TOTP codes, or account labels. They strictly deliver operational security auditing events (e.g. *"New session initiated from Spain"* or *"Session revoked remotely"*).

#### 1.6.2 BYOK (Bring Your Own Key) Email
For users preferring email security notifications, Revolt Pass implements a zero-cost **BYOK** model:
- Users optionally provide their personal free-tier Resend API key (3,000 free emails/month for life) or the instance leverages Cloudflare Email Workers (`send_email`).
- The project maintains zero paid centralized SMTP infrastructure, never collecting or marketing user email addresses.

---

### 1.7 Per-Item Envelope Encryption (`item_key` - v2.0)
To establish granular cryptographic isolation and lay the foundation for asymmetric cross-account sharing (v2.5), each item within the vault (`VaultItem`) possesses its own independent symmetric key:
1. **Generation:** When creating or normalizing an item, the client generates a 256-bit cryptographic key using `crypto.getRandomValues(new Uint8Array(32))`.
2. **Wrapping:** The item's key is encrypted using AES-256-GCM under the user's `MasterKey` with a fresh 12-byte IV.
3. **Storage Format:** The `encrypted_key` attribute is stored serialized as:
   $$\text{encrypted\_key} = \text{base64}(IV) \parallel \text{":"} \parallel \text{base64}(Ciphertext \parallel AuthTag)$$
4. **Security Benefit:** Selective compromise or re-encryption vectors do not compromise adjacent items. Furthermore, cross-account sharing (v2.5) only requires re-wrapping `item_key` under the shared ECDH key without re-encrypting the item's payload body.

---

### 1.8 Historical Snapshots & Backup Isolation in Cloudflare D1 (v2.0)
Disaster recovery, data corruption mitigation, and accidental deletion protection are implemented via transactional snapshots in Cloudflare D1:
1. **Cryptographic Isolation:** Each row in `vault_snapshots` contains an `encrypted_blob` and `iv` encrypted via AES-256-GCM under the user's master key, identical to records in the primary `vaults` table. The server possesses zero inspection or decryption capabilities over snapshots.
2. **Resource Governance (Rolling 5-Version Window):** During synchronization (`PUT /api/vault`), the Worker atomically archives the preceding state and purges snapshots exceeding the 5-version ceiling per user, preserving Cloudflare free tier quotas.
3. **Monotonic Secure Rollback (OCC):** Restorations performed via `POST /api/vault/restore/:vault_version` assign `version = current.version + 1`, ensuring that no local client retains stale state or encounters concurrency conflicts when syncing back.

---

### 1.9 Security Model of the Physical Printable Emergency Kit (v2.0)
To eliminate the catastrophic risk of permanent account lockout due to master password amnesia, biometric device loss, or unexpected incapacitation, Revolt Pass provides a physical Emergency Kit generator:
1. **100% Client-Side & Offline Execution:** The kit is generated strictly in local browser memory and dispatched via `window.print()`. No document render payloads, images, or master credentials are ever transmitted to third-party PDF rendering services.
2. **Vector SVG QR Code Payload:** The rendered high-definition vector SVG QR code encodes the encrypted vault payload (`vault_data`), identical to the blob at rest. Without the handwritten Master Password, scanning the QR code yields zero plaintext secrets to unauthorized third parties.
3. **Air-Gapped Handwritten Principle:** The Master Password is **NEVER** printed, rendered into the DOM, or encoded in the QR code. The document reserves a prominent physical handwritten box for manual pen entry after printing, strictly decoupling the master secret from the digital plane.

---

## 2. Threat Model (STRIDE & Attack Vector Analysis)

Revolt Pass security posture is evaluated using Microsoft's **STRIDE** methodology alongside an attack vector matrix.

```mermaid
quadrantChart
    title Severity vs Feasibility Threat Matrix
    x-axis "Low Technical Feasibility" --> "High Technical Feasibility"
    y-axis "Low Operational Impact" --> "Catastrophic Impact"
    quadrant-1 "Priority Focus (Mitigated by Design)"
    quadrant-2 "High Severity (Mitigated by Cryptography)"
    quadrant-3 "Minor / Residual Risk"
    quadrant-4 "Operational Interest Surface"
    "DB Compromised (Cloudflare breach)": [0.15, 0.95]
    "Clipboard Sniffing": [0.85, 0.70]
    "Unattended Desktop (Physical)": [0.75, 0.85]
    "Man-in-the-Middle (Network)": [0.20, 0.80]
    "Brute Force Master Password": [0.30, 0.95]
    "Clock Desync (Time Drift)": [0.80, 0.40]
    "ECDH Key Substitution": [0.30, 0.85]
    "Shared Item Replay": [0.25, 0.60]
    "Push Relay Tampering": [0.20, 0.30]
    "Snapshot Rollback Hijack": [0.15, 0.80]
    "Trash Bin Data Lingering": [0.30, 0.50]
    "Emergency Kit Print Leak": [0.10, 0.90]
```

### Detailed Attack Vector Matrix and Mitigations

| Vector / ID | STRIDE Category | Threat Description | Impact | Implemented Mitigation Controls |
| :--- | :--- | :--- | :--- | :--- |
| **VEC-01** | *Information Disclosure* | **Cloudflare D1 Compromise:** A malicious actor or rogue employee with administrative access to Cloudflare extracts the `vaults` or `vault_snapshots` table. | Nil (Zero-Knowledge) | **Cryptographic Inviolability:** The database only stores AES-256-GCM encrypted blobs. Without the Master Password and salt, cracking the blob requires $2^{255}$ computational operations, which is physically impossible. |
| **VEC-02** | *Tampering* | **Data Tampering in Transit or Rest:** Malicious modification of bytes in `encrypted_blob` inside D1 to induce anomalous client behavior. | Nil (Immediate Rejection) | **GCM Authentication Tag:** AES-GCM verifies the 128-bit Authentication Tag. Modifying a single bit causes `crypto.subtle.decrypt` to throw an immutable error, immediately locking the app without processing corrupt data. |
| **VEC-03** | *Information Disclosure* | **Physical Access to Unattended Workstation:** The operator leaves their desk with the PWA unlocked in foreground. | Critical | **Inactivity & Background Auto-Lock:** RAM timer purges keys after 5 minutes of keyboard/mouse inactivity. Additionally, the `visibilitychange` event locks the vault if the tab remains hidden. |
| **VEC-04** | *Information Disclosure* | **Clipboard Sniffing:** Background applications or unprivileged malware monitoring the OS clipboard to capture TOTP or Recovery Codes. | High | **Scheduled Auto-Clear:** Routine with strict 45-second timer overwriting clipboard with empty text. Compares previous content to avoid clearing legitimate data if user copied something else in between. |
| **VEC-05** | *Information Disclosure* | **Offline Brute Force on Master Password:** Attacker steals salt and encrypted blob, attempting dictionary and hash-cracking attacks. | High (Infeasible) | **Argon2id Memory-Hardness (64 MB, 3 rounds) & PBKDF2 600k:** Argon2id demands 64 MB of physical memory per guess, saturating memory bandwidth of ASICs and GPU clusters and nullifying distributed cracking. Legacy PBKDF2 accounts are automatically upgraded upon unlock. |
| **VEC-06** | *Elevation of Privilege* | **Cross-Site Scripting (XSS) Attacks:** JavaScript injection to inspect browser memory or intercept keystrokes. | Critical | **Strict Isolation & CSP:** Content Security Policy blocking `unsafe-inline`, `unsafe-eval` and restricting external resource loading strictly to `self` and `cdn.simpleicons.org`. Zero runtime CDN dependencies. |
| **VEC-07** | *Denial of Service* | **Sync Failure Due to Connectivity Loss:** User travels on an airplane or encounters outages and needs access to corporate accounts. | High | **Absolute Offline Availability (100%):** Entire state remains encrypted in IndexedDB and assets precached in Service Worker. Operates indefinitely in airplane mode. |
| **VEC-08** | *Information Disclosure / Spoofing* | **Web Push Notification Interception or Tampering:** Network adversary intercepts or attempts to forge push notifications directed to user devices. | Nil | **RFC 8291 Payload Encryption (ECDH P-256 + AES-128-GCM):** All push payloads are encrypted end-to-end to the browser's key pair. Notifications never contain vault secrets or master credentials. |
| **VEC-09** | *Tampering / Rollback* | **Malicious Rollback via Snapshots:** An adversary attempts to force restoration to a stale snapshot containing revoked credentials or compromised passwords. | High | **Strict Session Auth & OCC Monotonicity:** Restoration strictly requires authenticated session ownership. Restored versions strictly increment to `current.version + 1`, alerting other devices through sync reconciliation and preventing state confusion. |
| **VEC-10** | *Information Disclosure* | **Residual Secret Lingering in Trash:** Deleted secrets linger indefinitely in database ciphertexts or local cache. | Medium | **Automated 30-Day Cryptographic Purge:** During each vault save cycle (`encryptVault`), items exceeding 30 days in soft deletion are permanently omitted from serialized JSON before encryption, guaranteeing mathematical non-existence in ciphertext. |
| **VEC-11** | *Information Disclosure* | **Credential Leakage in Emergency Kit Printing:** Accidental transmission of master credentials to network printer spoolers or document rendering APIs. | Critical | **Offline Air-Gapped Handwritten Principle:** Emergency Kit generation executes 100% offline in browser memory. The Master Password is never written to DOM or encoded into the SVG QR code; users manually write it by hand into the designated physical box. |
| **VEC-NEW-01** | *Spoofing / Tampering* | **Malicious ECDH Public Key Substitution (Key Substitution Attack):** An attacker compromising Cloudflare D1 replaces a user's public key with their own to intercept and decrypt shared items addressed to that recipient. | Critical | **Out-of-Band Visual Fingerprint Verification:** The UI computes and presents the SHA-256 fingerprint of the recipient's public key (`SHA-256(spki)` in grouped hex or emoji-hash format). Users verify this fingerprint via an independent secure channel (Signal, voice call) before sharing sensitive secrets. |
| **VEC-NEW-02** | *Tampering / Replay* | **Replay or Insertion of Stale Shared Ciphertext:** An attacker replays an old shared ciphertext to overwrite an updated item or reverse a revocation. | Medium | **D1 Uniqueness Constraints & Monotonic Versions:** Database constraint `UNIQUE(owner_user_id, recipient_user_id, source_item_id)`, version monotonicity, and strict session authentication preventing third parties from injecting or modifying rows in `shared_items`. |
| **VEC-NEW-03** | *Information Disclosure* | **Mass Recipient Enumeration:** Automated scraping of the public key endpoint to identify registered usernames on the platform. | Low | **Edge Defense-in-Depth:** Requires an active authenticated session (`Authorization: Bearer <token>`) to query `/api/users/:username/public-key` and enforces Cloudflare Workers edge rate limiting against brute-force queries per IP. |

---

## 3. Engineering Mitigations and Best Practices

### 3.1 RAM Memory Hygiene
In garbage-collected browser environments, guaranteed memory wiping poses unique challenges. To mitigate secret persistence:
1. Keys are managed primarily as non-extractable `CryptoKey` objects.
2. Temporary keys or plaintext passwords handled as `Uint8Array` are explicitly overwritten with zeroes immediately after use:
   ```typescript
   function secureZeroBuffer(buffer: Uint8Array): void {
     buffer.fill(0);
   }
   ```
3. Upon lock event, the state variable `activeSessionState.masterKey` is set to `null` and dereferencing is invoked on vault items to allow immediate V8 garbage collection.

### 3.2 Content Security Policy (CSP) on Cloudflare
The Worker and response headers emitted by Cloudflare for the subdomain `https://<your-domain-or-subdomain>.workers.dev` apply the following canonical directive:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.simpleicons.org; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 3.3 Automatic Clipboard Clearing Protocol (Algorithm)
```typescript
class ClipboardGuard {
  private timeoutId: number | null = null;
  private lastCopiedSecret: string | null = null;

  public copySecret(secret: string, clearDelayMs = 45000): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
    }

    navigator.clipboard.writeText(secret).then(() => {
      this.lastCopiedSecret = secret;
      this.timeoutId = window.setTimeout(async () => {
        try {
          // Only clear if the clipboard still holds the protected secret
          const currentText = await navigator.clipboard.readText();
          if (currentText === this.lastCopiedSecret) {
            await navigator.clipboard.writeText('');
          }
        } catch {
          // If read permissions fail, force preemptive blank write
          await navigator.clipboard.writeText('');
        } finally {
          this.lastCopiedSecret = null;
          this.timeoutId = null;
        }
      }, clearDelayMs);
    });
  }
}
```
This algorithm prevents inadvertent secret leaks into messaging applications, office suites, or screen capture tools.

### 3.4 Session Security and Cryptographic Token Hashing (D1)
* **Session Tokens:** Each authenticated client possesses an ephemeral session token generated on the client with high entropy (`crypto.getRandomValues`).
* **Database Breach Resistance:** Session tokens are never stored in plaintext within Cloudflare D1. The Worker computes a **SHA-256** hash of the token (`token_hash`) prior to database storage and indexing in the `sessions` table.
* **Immediate Granular Revocation:** If a session token is revoked individually (`is_revoked = 1`), any subsequent API request presenting that token is immediately rejected with HTTP `401 Unauthorized`.

### 3.5 Biometric Re-entry Mitigation & Hardware Passkeys Lifecycle (FIDO2)
* **Threat Vector:** In a corporate, shared, or public workstation environment, a user may log out of their session. However, if the workstation hardware maintains a registered Windows Hello PIN or biometric authenticator, a third party with physical access could attempt to re-authenticate without the Master Password.
* **Architectural Mitigation:**
  1. **Remote Passkey Revocation:** Users can list all enrolled Passkeys from any other device and revoke/delete them (`DELETE /api/passkeys/:id`).
  2. **Elimination of Windows Hello Bypass:** Insecure bypass flows have been eliminated, ensuring that no local key wrapping can be decrypted without completing standard platform authentication.

### 3.6 Strict Internationalization Privacy (Zero-Leak i18n)
* **Zero Third-Party APIs:** Unlike applications that proxy rendered DOM strings to cloud translation services (Google Translate, DeepL, etc.) — which risks leaking account descriptions, service names, and 2FA credentials —, Revolt Pass utilizes 100% static dictionaries compiled directly into the client bundle.
* **Zero Language Telemetry:** Locale preferences are stored purely in `localStorage.revolt_lang` and never transmitted to or logged on any remote server.

---

### 3.7 Extension of the Trust Model (Cross-Account Secure Sharing v2.5: Relationship Metadata vs. ZK Content)
Milestone v2.5 introduces asymmetric cross-account secret sharing. As an engineering transparency principle, we rigorously delineate what the central infrastructure learns versus what remains strictly inviolable under Zero-Knowledge:

#### 1. Information Learned by the Server / Cloudflare D1 (Relationship Metadata):
* **Transaction Participants:** Who shares (`owner_user_id`) and with whom (`recipient_user_id`).
* **Opaque Source Item Identifier:** The UUID/CUID identifier of the shared item (`source_item_id`).
* **Timestamps:** Sharing creation date (`created_at`), update date (`updated_at`), and revocation date (`revoked_at`).
* **Granted Permissions:** Whether the recipient possesses read-only (`read`) or collaborative edit (`write`) privileges.
* **ECDH P-384 Public Keys:** Public SPKI key representations required to perform Diffie-Hellman key agreement.

#### 2. Information 100% Shielded Under Zero-Knowledge (Content & Key Confidentiality):
* **Secret Content:** Usernames, passwords, TOTP seeds, backup codes, and notes (`encrypted_item`).
* **Item Symmetric Key (`item_key`):** Encapsulated (`encrypted_item_key`) under an AES-256-GCM wrapping key derived strictly in the browser RAM of the two parties via ECDH + HKDF.
* **Resilience to Centralized Breaches:** Even with a full database dump of D1 or compromised Worker execution at the edge, an attacker cannot decrypt items or extract symmetric keys, as no ECDH private key ever reaches the server or leaves the client unencrypted.
* **Volatile RAM Lifecycle:** Received shared items are decrypted in real time and retained **strictly in volatile client RAM**; they are never persisted as plaintext in IndexedDB, mitigating forensic recovery risks from lost or stolen devices.

