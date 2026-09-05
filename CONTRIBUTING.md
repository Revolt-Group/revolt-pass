# Contributing to Revolt Pass

First off, thank you for considering contributing to **Revolt Pass**! 🎉

Revolt Pass is an open-source, sovereign, Zero-Knowledge 2FA and security vault built on Cloudflare Workers, Cloudflare D1, and modern React with native Web Crypto. We welcome contributions from developers, security researchers, designers, and privacy advocates.

*Read this document in other languages: [Español](./CONTRIBUTING.es.md)*

---

## 🏛️ Guiding Cryptographic Principles

Before writing code, please review our core architectural rules:

1. **Strict Zero-Knowledge:** The server must **never** receive plaintext secrets, master passwords, or encryption keys. It only ever persists encrypted binary blobs (`AES-GCM-256`) and synchronization metadata.
2. **Native Web Crypto Only:** Never install external, user-space JavaScript cryptographic libraries (e.g. `crypto-js`, `forge`). All cryptographic primitives must rely on `window.crypto.subtle` or native WebAssembly when strictly justified.
3. **Memory Hygiene:** Sensitive strings or buffers in memory must be dereferenced, cleaned, or purged on auto-lock.
4. **Offline-First Resilience:** Any UI feature must function completely offline with IndexedDB local persistence.

---

## 🛠️ Getting Started

### Prerequisites
* **Node.js:** `>= 20.0.0`
* **Package Manager:** `pnpm` (required — do not use `npm` or `yarn`)
* **Cloudflare CLI:** `wrangler` (installed via devDependencies)

### Local Setup
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/Revolt-Group/revolt-pass.git
   cd revolt-pass
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Set up local Wrangler configuration:
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```
4. Start the frontend development server:
   ```bash
   pnpm dev
   ```
5. Run the test suite:
   ```bash
   pnpm test
   ```
6. Build and typecheck for production:
   ```bash
   pnpm build
   ```

---

## 🧪 Testing Guidelines

We enforce high test coverage for all cryptographic primitives and synchronization logic:
* Unit and integration tests are run via **Vitest**.
* Tests live alongside the code (e.g. `*.test.ts`).
* Before submitting a pull request, ensure all tests pass:
  ```bash
  pnpm test
  pnpm build
  ```

---

## 📝 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

* `feat(scope):` A new feature (e.g. `feat(vault): add folder grouping`)
* `fix(scope):` A bug fix (e.g. `fix(totp): correct time drift calculation`)
* `docs(scope):` Documentation changes (e.g. `docs: update deployment guide`)
* `refactor(scope):` Code changes that neither fix bugs nor add features
* `test(scope):` Adding or modifying tests
* `perf(scope):` Performance improvements

---

## 🔀 Pull Request Process

1. Create a descriptive feature branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Make your changes adhering to TypeScript strict mode and Tailwind CSS conventions.
3. Ensure no personal credentials, API keys, or database IDs are committed.
4. Push your branch and open a Pull Request against `main`.
5. Describe your changes clearly in the PR description, referencing any related issues.

---

## 🔒 Security Vulnerability Reporting

If you discover a potential security vulnerability within Revolt Pass, please **do NOT report it publicly on GitHub Issues**.

Instead, please send a responsible disclosure report directly to the maintainers at **dev@revoltgroup.com.ar** or open a [GitHub Private Vulnerability Report](https://github.com/Revolt-Group/revolt-pass/security/advisories/new).
