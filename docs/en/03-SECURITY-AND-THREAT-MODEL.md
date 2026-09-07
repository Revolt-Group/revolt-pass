# Cryptographic Specification & Threat Model
## Project: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadata | Detail |
| :--- | :--- |
| **Document Identifier** | `RP-SEC-003` |
| **Version** | `1.2.1-PROD` |
| **Status** | Approved / Cryptographic Grade Security Specification |
| **Frameworks & Standards** | OWASP ASVS v4.0, NIST SP 800-63B, RFC 6238, RFC 5869, W3C WebAuthn Level 3 |
| **Production Domain** | `https://<your-domain-or-subdomain>.workers.dev` |
| **License** | GNU AGPLv3 + Revolt Group Trademark Policy |

---

## 1. Formal Cryptographic Specification

Revolt Pass adheres to the **Zero-Knowledge** cryptographic paradigm. All operations including entropy generation, key derivation, symmetric encryption, and integrity verification occur exclusively within the client execution environment via the **Web Crypto API** (`window.crypto.subtle`), a native component compiled in C++ / Rust inside the browser engine and protected against user-space tampering.

### 1.1 Master Key Derivation (Key Derivation Function - KDF)
Deriving the master key from the user's password is governed by the following immutable parameters:

| Parameter | Canonical Value | Engineering Rationale / Standard |
| :--- | :--- | :--- |
| **Base Algorithm** | `PBKDF2` (Password-Based Key Derivation Function 2) | RFC 8018, industry standard natively supported in Web Crypto without external dependencies. |
| **Pseudorandom Function (PRF)** | `HMAC-SHA256` | Provides superior collision resistance compared to SHA-1 and mitigates length extension attacks. |
| **Iterations** | **$600,000$ rounds** | Exceeds the OWASP Password Storage Cheat Sheet threshold (minimum recommended: 600,000 for PBKDF2-HMAC-SHA256), enforcing a massive computational cost against GPU/ASIC clusters. |
| **Salt (Salting)** | $128 \text{ bits}$ ($16 \text{ bytes}$) random | Cryptographically generated via `crypto.getRandomValues(new Uint8Array(16))`. Unique per user, preventing rainbow table attacks. |
| **Derived Key Length** | $256 \text{ bits}$ ($32 \text{ bytes}$) | Exactly matches the length required for the symmetric `AES-GCM-256` key. |
| **Key Exportability** | `extractable: false` | The `CryptoKey` generated in RAM is marked non-extractable by JavaScript, preventing arbitrary extraction via object inspection. |

#### Mathematical Derivation Process:
$$\text{BaseKey} = \text{importKey}(\text{"raw"}, \text{encode}(\text{MasterPassword}), \text{"PBKDF2"})$$
$$\text{MasterKey} = \text{deriveKey}(\text{PBKDF2-HMAC-SHA256}, \text{BaseKey}, \text{Salt}, 600000, \text{"AES-GCM"}, 256)$$

To avoid blocking the main UI thread during the ~300-800 ms calculation of 600,000 iterations, this process is offloaded to an isolated **Web Worker** (`src/lib/crypto/kdf.worker.ts`).

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
* **Initialization Vector (IV / Nonce):** 96 bits (12 bytes). **Strict Rule:** A fresh IV is generated with `crypto.getRandomValues(new Uint8Array(12))` **on every save operation**. Reusing a (Key, IV) pair under AES-GCM destroys authenticity and can enable plaintext recovery.
* **Authentication Tag:** 128 bits (16 bytes). The authentication tag enforces strict cryptographic integrity: altering a single bit in the database or in transit triggers immediate rejection (`OperationError`) during `subtle.decrypt()`, neutralizing tampering attacks.

---

### 1.3 Quick Unlock Mechanism via WebAuthn / Passkeys
To provide a frictionless experience without compromising the Zero-Knowledge model, a **Local Key Wrapping** architecture backed by FIDO2 / WebAuthn hardware is implemented:

1. **Enrollment:**
   * The user successfully authenticates with their Master Password (obtaining `MasterKey`).
   * The client invokes `navigator.credentials.create()` configuring:
     * `authenticatorAttachment: "platform"` (restricts to local device hardware: Windows Hello on PC, Touch ID / Face ID on Apple, Biometrics on Android).
     * `userVerification: "required"` (enforces Windows Hello PIN or biometric scan).
   * The client generates a random local symmetric wrapping key (`DeviceWrappingKey`, 256 bits).
   * The `MasterKey` is encrypted with the `DeviceWrappingKey` via AES-GCM, producing `wrapped_master_key`.
   * The `DeviceWrappingKey` is stored protected in the browser's local store, bound to the registered WebAuthn credential ID.
2. **Subsequent Unlock:**
   * The application requests assertion with `navigator.credentials.get({ publicKey: { challenge, userVerification: "required" } })`.
   * The user enters their **Windows Hello PIN** or touches the fingerprint sensor on mobile.
   * Upon valid assertion returned by the OS hardware TPM/Enclave, the client releases `DeviceWrappingKey`, decrypts `wrapped_master_key`, and reconstructs `MasterKey` in volatile RAM.
   * If the user revokes the credential, uninstalls the PWA, or verification fails, the wrapping key is purged and the system requires the Master Password.

---

### 1.4 TOTP Engine (RFC 6238 / RFC 4226)
Time-based one-time password (TOTP) generation strictly follows IETF specifications:

1. **Base32 Decoding (RFC 4648):**
   * Secret is sanitized by stripping null bytes, dashes, and spaces.
   * Pure TypeScript Base32 decoder:
     * Input: `string` characters in alphabet `[A-Z2-7]`.
     * Output: binary `Uint8Array` bytes.
2. **Step Interval Calculation:**
   $$C_t = \left\lfloor \frac{T_{local} + \Delta T_{drift}}{X} \right\rfloor$$
   where $X = 30$ seconds, $T_{local}$ is Unix time in seconds, and $\Delta T_{drift}$ is the time offset calculated against the Worker.
   The counter $C_t$ is serialized as a 64-bit integer in Big-Endian format (8 bytes).
3. **HMAC Generation:**
   * Sign $C_t$ with the decoded secret key using `crypto.subtle.sign("HMAC", hmacKey, counterBuffer)`.
   * Supported algorithms: `SHA-1` (default 20 bytes) and `SHA-256` (32 bytes).
4. **Dynamic Truncation:**
   * The last byte of the hash determines the offset:
     $$\text{offset} = \text{hash}[20 - 1] \ \& \ \text{0x0F}$$
   * Extract 4 bytes starting at offset, masking to clear the most significant sign bit:
     $$\text{binary} = ((\text{hash}[\text{offset}] \ \& \ \text{0x7F}) \ll 24) \ | \ ((\text{hash}[\text{offset} + 1] \ \& \ \text{0xFF}) \ll 16) \ | \ ((\text{hash}[\text{offset} + 2] \ \& \ \text{0xFF}) \ll 8) \ | \ (\text{hash}[\text{offset} + 3] \ \& \ \text{0xFF})$$
   * Calculate final code via modulo:
     $$\text{token} = (\text{binary} \pmod{10^{\text{digits}}}).\text{toString}().\text{padStart}(\text{digits}, \text{'0'})$$

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
    "Brute Force Master Password": [0.40, 0.90]
    "Clock Desync (Time Drift)": [0.80, 0.40]
```

### Detailed Attack Vector Matrix and Mitigations

| Vector / ID | STRIDE Category | Threat Description | Impact | Implemented Mitigation Controls |
| :--- | :--- | :--- | :--- | :--- |
| **VEC-01** | *Information Disclosure* | **Cloudflare D1 Compromise:** A malicious actor or rogue employee with administrative access to Cloudflare extracts the `vaults` table. | Nil (Zero-Knowledge) | **Cryptographic Inviolability:** The database only stores AES-256-GCM encrypted blobs. Without the Master Password and salt, cracking the blob requires $2^{255}$ computational operations, which is physically impossible. |
| **VEC-02** | *Tampering* | **Data Tampering in Transit or Rest:** Malicious modification of bytes in `encrypted_blob` inside D1 to induce anomalous client behavior. | Nil (Immediate Rejection) | **GCM Authentication Tag:** AES-GCM verifies the 128-bit Authentication Tag. Modifying a single bit causes `crypto.subtle.decrypt` to throw an immutable error, immediately locking the app without processing corrupt data. |
| **VEC-03** | *Information Disclosure* | **Physical Access to Unattended Workstation:** The operator leaves their desk with the PWA unlocked in foreground. | Critical | **Inactivity & Background Auto-Lock:** RAM timer purges keys after 5 minutes of keyboard/mouse inactivity. Additionally, the `visibilitychange` event locks the vault if the tab remains hidden. |
| **VEC-04** | *Information Disclosure* | **Clipboard Sniffing:** Background applications or unprivileged malware monitoring the OS clipboard to capture TOTP or Recovery Codes. | High | **Scheduled Auto-Clear:** Routine with strict 45-second timer overwriting clipboard with empty text. Compares previous content to avoid clearing legitimate data if user copied something else in between. |
| **VEC-05** | *Information Disclosure* | **Offline Brute Force on Master Password:** Attacker steals salt and encrypted blob, attempting dictionary and hash-cracking attacks. | High | **High Work Factor (PBKDF2 600,000 rounds):** 600,000 iterations with SHA-256 force massive CPU/energy consumption per attempt, making brute force infeasible against strong passwords. |
| **VEC-06** | *Elevation of Privilege* | **Cross-Site Scripting (XSS) Attacks:** JavaScript injection to inspect browser memory or intercept keystrokes. | Critical | **Strict Isolation & CSP:** Content Security Policy blocking `unsafe-inline`, `unsafe-eval` and restricting external resource loading strictly to `self` and `cdn.simpleicons.org`. Zero runtime CDN dependencies. |
| **VEC-07** | *Denial of Service* | **Sync Failure Due to Connectivity Loss:** User travels on an airplane or encounters outages and needs access to corporate accounts. | High | **Absolute Offline Availability (100%):** Entire state remains encrypted in IndexedDB and assets precached in Service Worker. Operates indefinitely in airplane mode. |

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
