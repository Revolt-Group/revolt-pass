# Revolt Pass — Zero-Knowledge 2FA & Security Vault

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](#)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict_6.0-blue.svg)](#)
[![Vite: v8](https://img.shields.io/badge/Vite-v8-646CFF.svg)](#)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg)](#)
[![Tailwind: v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](#)
[![Cloudflare: Workers_%2B_D1](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020.svg)](#)

> Progressive Web App (PWA) de grado empresarial con arquitectura criptográfica **Zero-Knowledge (Conocimiento Cero)** para gestión soberana de factores de autenticación (TOTP - RFC 6238), almacenamiento estructurado de claves de recuperación (*recovery codes*) y desbloqueo biométrico nativo (Windows Hello con PIN / Touch ID / Face ID).

**Dominio Productivo:** [https://pass.revoltgroup.com.ar](https://pass.revoltgroup.com.ar)

---

## 🏛️ Suite de Documentación de Ingeniería

La especificación técnica canónica y única fuente de verdad del proyecto se encuentra en el directorio [`/docs`](./docs):

- **[docs/01-PRD.md](./docs/01-PRD.md):** Requerimientos de producto, alcance (In-Scope vs. Out-of-Scope), especificación funcional y no funcional, métricas de éxito.
- **[docs/02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md):** Diagramas C4, flujos integrales de datos, contratos REST OpenAPI, tipos canónicos TypeScript y esquema D1.
- **[docs/03-SECURITY-AND-THREAT-MODEL.md](./docs/03-SECURITY-AND-THREAT-MODEL.md):** Parámetros criptográficos (PBKDF2 600k, AES-GCM 256, WebAuthn), modelo de amenazas STRIDE y mitigaciones de memoria/clipboard.
- **[docs/04-ADRS.md](./docs/04-ADRS.md):** Registros de decisiones arquitectónicas (ADR-001 a ADR-006) en formato Nygard.
- **[docs/05-ROADMAP.md](./docs/05-ROADMAP.md):** Plan de ejecución secuencial de 8 fases con criterios *Definition of Done* (DoD).

---

## 🚀 Pila Tecnológica

- **Gestor de Paquetes:** `pnpm` (exclusivo).
- **Frontend:** React 19 + TypeScript (Strict Mode) + Vite 8.
- **Estilos:** Tailwind CSS v4 + Lucide React.
- **Criptografía:** Web Crypto API nativa (`window.crypto.subtle`) + WebAuthn FIDO2 Level 3 (Windows Hello con PIN / Biometría).
- **Almacenamiento Local:** IndexedDB mediante `idb` + Workbox PWA (`vite-plugin-pwa`) para disponibilidad 100% offline.
- **Backend Edge:** Cloudflare Workers (Edge Runtime) + Cloudflare D1 (SQLite Serverless).

---

## 🛠️ Comandos de Desarrollo

```bash
# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo frontend
pnpm dev

# Compilar TypeScript y empaquetar para producción
pnpm build

# Ejecutar linter
pnpm lint

# Simulación y despliegue con Wrangler
pnpm wrangler dev
pnpm wrangler d1 migrations apply DB --local
```
