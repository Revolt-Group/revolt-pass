<p align="right">
  <strong>Español</strong> | <a href="./README.en.md">English</a>
</p>

# Revolt Pass — Zero-Knowledge 2FA & Security Vault

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict_6.0-blue.svg)](#)
[![Vite: v8](https://img.shields.io/badge/Vite-v8-646CFF.svg)](#)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg)](#)
[![Tailwind: v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](#)
[![Cloudflare: Workers_%2B_D1](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020.svg)](#)
[![Tests: 73/73](https://img.shields.io/badge/Tests-73%2F73_Passing-brightgreen.svg)](#)

> Progressive Web App (PWA) de grado de ciberseguridad con arquitectura criptográfica **Zero-Knowledge (Conocimiento Cero)** para la gestión soberana de factores de autenticación (TOTP - RFC 6238), almacenamiento estructurado de códigos de recuperación (*recovery codes*), soporte de logos personalizados con compresión local, internacionalización bilingüe (ES/EN) y desbloqueo biométrico nativo (Windows Hello / Passkeys FIDO2).

---

## 🌟 Características Principales

* **Cifrado Zero-Knowledge en Cliente:** Cifrado simétrico autenticado **AES-GCM de 256 bits** con vector de inicialización (`IV`) fresco por guardado y derivación de clave maestra mediante **Argon2id / PBKDF2 (600,000 rondas)** en un Web Worker dedicado.
* **Infraestructura Serverless Edge (\$0 Costo Operativo):** Sincronización bidireccional ultrarrápida impulsada por **Cloudflare Workers** y la base de datos distribuida **Cloudflare D1 (SQLite Serverless)**, operando 100% dentro de la capa gratuita de Cloudflare.
* **Internacionalización Bilingüe (i18n ES / EN):** Soporte integral de Español e Inglés sin llamadas a traductores en la nube ni fugas de privacidad, con diccionarios tipados compilados en el cliente y selector dinámico instantáneo.
* **Panel de Seguridad y Gestión Granular de Sesiones:** Monitoreo en tiempo real de dispositivos y sesiones activas, nombrado personalizado persistente de dispositivos, y cierre remoto individual de sesiones.
* **Desbloqueo Rápido y Administración de Passkeys (WebAuthn Level 3):** Soporte para **Windows Hello (PIN o biometría)**, Touch ID y Face ID. Panel de visualización, nombrado y revocación remota de credenciales Passkey para neutralizar accesos no autorizados en PCs compartidas.
* **100% Offline-First:** Toda la bóveda se almacena localmente cifrada en **IndexedDB** (`idb`). Podés ver, generar códigos TOTP y gestionar respaldos completamente sin internet. Al recuperar conectividad, el motor de sincronización concilia automáticamente cambios diferidos (*Last-Write-Wins* a nivel de ítem).
* **Compensación de Deriva Temporal Atómica (Time Drift):** Sincronización continua de reloj contra la hora atómica UTC de Cloudflare, eliminando rechazos de tokens por desajustes en el reloj del dispositivo.
* **Gestión de Códigos de Recuperación:** Soporte para pegado masivo de códigos de respaldo (ej. 8 o 10 códigos a la vez), control de estado (usado / disponible), copiado seguro y borrado automático del portapapeles a los 45 segundos.
* **Personalización de Logos y Fotos de Cuenta:** Subida de imagen local, enlace directo HTTPS o pegado desde portapapeles (`Ctrl + V`), con compresión automática en cliente vía Canvas a WebP de 96x96 px (~2 KB) cifrado en la bóveda.
* **PWA Instalable:** Service Worker con Workbox para caché agresivo de activos estáticos, compatible como app nativa de escritorio en Windows/macOS y app móvil en Android/iOS.

---

## 🚀 Despliegue Rápido y Auto-Alojamiento (Self-Hosting)

Desplegar tu propia instancia privada y soberana de Revolt Pass en Cloudflare toma menos de 3 minutos:

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/Revolt-Group/revolt-pass.git
cd revolt-pass
pnpm install
```

### 2. Iniciar sesión en Cloudflare CLI
```bash
pnpm wrangler login
```

### 3. Crear la base de datos Cloudflare D1
```bash
pnpm wrangler d1 create revolt-pass-db
```
El comando devolverá un `database_id` único (UUID).

### 4. Configurar `wrangler.toml`
Copia la plantilla de configuración:
```bash
cp wrangler.toml.example wrangler.toml
```
Edita `wrangler.toml` y pega tu `database_id` en la sección correspondiente:
```toml
[[d1_databases]]
binding = "DB"
database_name = "revolt-pass-db"
database_id = "<PEGA_AQUI_TU_DATABASE_ID>"
```

### 5. Aplicar las migraciones de base de datos
```bash
pnpm wrangler d1 execute revolt-pass-db --file=schema.sql --remote
```

### 6. Compilar y Desplegar
```bash
pnpm build
pnpm wrangler deploy
```
¡Listo! Cloudflare te otorgará una URL activa (ej. `https://revolt-pass.<tu-subdominio-cloudflare>.workers.dev`) o podrás vincular tu propio dominio personalizado en la configuración del Worker.

---

## 🏛️ Suite de Documentación de Ingeniería

La especificación técnica exhaustiva y canónica se encuentra disponible en Español e Inglés:

| Documento (Español) | Document (English) | Descripción / Description |
| :--- | :--- | :--- |
| **[01-PRD.md](./docs/es/01-PRD.md)** | **[01-PRD.md](./docs/en/01-PRD.md)** | Requerimientos de producto, alcance y KPIs de ingeniería |
| **[02-ARCHITECTURE.md](./docs/es/02-ARCHITECTURE.md)** | **[02-ARCHITECTURE.md](./docs/en/02-ARCHITECTURE.md)** | Arquitectura C4, flujos integrales de datos y esquema D1 |
| **[03-SECURITY-AND-THREAT-MODEL.md](./docs/es/03-SECURITY-AND-THREAT-MODEL.md)** | **[03-SECURITY-AND-THREAT-MODEL.md](./docs/en/03-SECURITY-AND-THREAT-MODEL.md)** | Criptografía, modelo STRIDE e higiene de memoria/portapapeles |
| **[04-ADRS.md](./docs/es/04-ADRS.md)** | **[04-ADRS.md](./docs/en/04-ADRS.md)** | Registros de decisiones arquitectónicas (ADR-001 a ADR-006) |
| **[05-ROADMAP.md](./docs/es/05-ROADMAP.md)** | **[05-ROADMAP.md](./docs/en/05-ROADMAP.md)** | Plan de fases secuenciales y criterios Definition of Done |

---

## 🛠️ Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo frontend (Vite)
pnpm dev

# Ejecutar la suite completa de pruebas unitarias y de integración (Vitest)
pnpm test

# Compilación y verificación estricta de tipos TypeScript
pnpm build

# Ejecutar el Worker y la base de datos D1 en entorno local
pnpm wrangler dev
```

---

## 🤝 Contribuciones

Agradecemos las contribuciones de la comunidad. Por favor, consulta nuestra **[Guía de Contribución](./CONTRIBUTING.es.md)** (*or [English Contributing Guide](./CONTRIBUTING.md)*) antes de enviar un Pull Request o reportar incidentes de seguridad.

---

## 📄 Licencia y Política de Marca Registrada

Este proyecto es software libre distribuido bajo los términos de la **[GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE)**. Consulta el archivo [`LICENSE`](./LICENSE) para el texto legal completo.

### 🛡️ Política de Marca y Activos (Trademark & Brand Policy)
El código fuente es abierto, pero los nombres **"Revolt"**, **"Revolt Group"**, **"Revolt Pass"**, los logotipos, iconos, gráficos y dominios asociados (`pass.revoltgroup.com.ar`) son marcas y activos protegidos de **Revolt Group**:
* **Uso no permitido:** No se concede licencia de marca para el uso de estos nombres o logos en bifurcaciones (forks), versiones modificadas o servicios comerciales derivados sin autorización previa expresa por escrito.
* **Derivados y Forks:** Si creas o distribuyes una versión modificada o servicio derivado basado en este código, estás obligado por la Sección 7(e) de la licencia a renombrar el software con un nombre claramente diferenciado y reemplazar todos los logotipos y elementos gráficos oficiales.
* **Atribución:** Debes preservar todos los avisos de copyright originales y la atribución a Revolt Group conforme a las Secciones 7(b) y 7(c) de la AGPLv3.
