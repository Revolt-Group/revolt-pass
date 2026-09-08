<p align="right">
  <strong>Español</strong> | <a href="./README.en.md">English</a>
</p>

# Revolt Pass — Zero-Knowledge Password, 2FA & Secrets Vault

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)
[![Version: v2.0.0](https://img.shields.io/badge/Version-v2.0.0-blue.svg)](./CHANGELOG.md)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict_6.0-blue.svg)](#)
[![Vite: v8](https://img.shields.io/badge/Vite-v8-646CFF.svg)](#)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg)](#)
[![Tailwind: v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](#)
[![Cloudflare: Workers_%2B_D1](https://img.shields.io/badge/Cloudflare-Workers_%2B_D1-F38020.svg)](#)
[![Tests: 143/143](https://img.shields.io/badge/Tests-143%2F143_Passing-brightgreen.svg)](#)

> Progressive Web App (PWA) de grado de ciberseguridad con arquitectura criptográfica **Zero-Knowledge (Conocimiento Cero)** para la gestión soberana de contraseñas, factores de autenticación (TOTP - RFC 6238), tarjetas de pago, notas seguras, claves SSH/servidor e identidades personales. Cuenta con cifrado de sobre por elemento (`item_key`), snapshots automáticos en Cloudflare D1 con rollback optimista, papelera con purga automática a los 30 días, Emergency Kit físico imprimible, derivación de clave con **Argon2id WASM (64 MB)**, alertas proactivas **Web Push RFC 8291/8292** y correo **BYOK (Resend / Cloudflare)**, importadores/exportadores universales, soporte YubiKey/FIDO2 y desbloqueo biométrico nativo (Windows Hello / Passkeys).

---

## 🌟 Características Principales

* **Suite Integral de Secretos Polimórficos (v2.0.0):**
  - **6 Tipos Canónicos de Secretos:** Gestión completa de Contraseñas/Logins (con generador CSPRNG, URLs web, token 2FA integrado e historial de contraseñas), Factores 2FA/TOTP, Tarjetas de Crédito/Débito (con detección automática de marca y revelación de CVV/PIN), Notas Seguras en Markdown cifradas, Claves de Servidor/SSH (host, puerto, usuario, clave pública, privada y passphrase) y Fichas de Identidad Personal.
  - **Cifrado de Sobre por Elemento (`item_key`):** Cada elemento cuenta con una clave simétrica única e independiente envuelta bajo la clave maestra, sentando las bases para el intercambio asimétrico ECDH (v2.5).
  - **Papelera de 30 Días con Purga Criptográfica:** Eliminación suave con restauración en 1 clic y destrucción definitiva automática tras 30 días sin fugas residuales en el texto cifrado.
  - **Snapshots en Cloudflare D1 y Rollback Optimista:** Historial automático de los últimos 5 estados de la bóveda en D1 con rollback en un clic e incremento optimista de versión (`current.version + 1`).
  - **Emergency Kit Físico Imprimible:** Generador offline en cliente de hoja de recuperación de alta resolución con QR vectorial y recuadro manuscrito de contraseña maestra.
* **Argon2id KDF y Alertas Proactivas Zero-Knowledge (v1.5.0):**
  - **Argon2id WASM:** Derivación de clave maestra resistente a memoria (64 MB, 3 rondas) compilada a WebAssembly via `hash-wasm`, inmune a ataques con clústeres GPU/ASIC. Incluye auto-upgrade silencioso e imperceptible de cuentas legadas PBKDF2 en su próximo inicio de sesión o desbloqueo, con recifrado de bóveda y re-empaquetado biométrico de passkeys.
  - **Web Push Nativo ($0 Costo):** Alertas push en tiempo real directas desde Cloudflare Worker mediante la Push API del navegador, Service Worker y RFC 8291/8292 (VAPID + AES-128-GCM). Alerta ante inicios de sesión desde nuevos países, nuevas sesiones activas, revocaciones remotas y passkeys añadidas.
  - **Alertas por Correo BYOK (Bring Your Own Key):** Notificaciones de seguridad por correo configurables a $0 de costo operacional mediante clave personal gratuita de Resend (3,000 emails/mes) o Cloudflare Email (`send_email`). Pestaña de Notificaciones dedicada en el Modal de Seguridad con botones de prueba inmediata.
* **Exportador Masivo por Carrusel de QRs y Visor QR Individual (v1.4.1):** Codificador binario nativo de Protocol Buffers en TypeScript puro para generar URIs de migración `otpauth-migration://offline?data=...` divididas en lotes de 7 cuentas con carrusel interactivo para absorber toda la bóveda con la cámara de Google Authenticator, Aegis o 2FAS. Visor vectorial SVG de alta definición para transferir cuentas individuales con cualquier app móvil (`otpauth://`).
* **Importadores Universales y Exportadores Abiertos (v1.4.0):** Migración instantánea y sin fricción desde Google Authenticator (decodificador Protobuf en TypeScript puro), Authy, Aegis, 2FAS, Bitwarden, 1Password, Proton Pass, Ente Auth, LastPass y listas de URIs `otpauth://`. Motor de reconciliación inteligente con previsualización interactiva de diferencias (*nuevas, duplicadas, conflictos*) y resolución seleccionable (*conservar existentes, sobrescribir o conservar ambos*). Exportación abierta hacia formatos Aegis JSON, Bitwarden CSV y lista `otpauth://`. Soporte WebAuthn para llaves de seguridad físicas por hardware (**YubiKey / FIDO2 Roaming**) y exportación del historial de auditoría de seguridad en CSV/JSON.
* **Cifrado Zero-Knowledge en Cliente:** Cifrado simétrico autenticado **AES-GCM de 256 bits** con vector de inicialización (`IV`) fresco por guardado y derivación de clave maestra mediante **Argon2id / PBKDF2 (600,000 rondas)** en un Web Worker dedicado.
* **Endurecimiento Perimetral y Seguridad en Capas (v1.3.1):** Cabeceras Content-Security-Policy (CSP) estrictas para mitigar XSS (VEC-06), limitador de tasa nativo en Cloudflare Workers para prevenir enumeración de usuarios y spam de registros, CORS restringido dinámicamente al dominio productivo (`APP_DOMAIN`) y rotación automática de tokens de sesión deslizantes (*sliding sessions*) en cada sincronización.
* **Diagnóstico de Salud, Higiene y Brechas k-Anonymity (v1.3):** Auditoría local y preventiva de seguridad con Scorecard interactivo (0-100%), detección de secretos Base32 débiles (<80 bits), duplicados reutilizados entre cuentas, control de obsolescencia de backups (>30 días) y comprobador de filtraciones de HaveIBeenPwned con privacidad matemática absoluta (sólo 5 caracteres hexadecimales de SHA-1 viajan al proxy perimetral con padding anti-análisis).
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

### 5. Configurar Variables de Entorno Frontend (`.env.local`)
Copia la plantilla de variables de entorno:
```bash
cp .env.example .env.local
```
Por defecto, `VITE_PRIVATE_INSTANCE=false` (modo abierto, ideal para auto-alojamiento personal o familiar donde cualquiera en tu servidor puede crear su bóveda aislada). Si deseas restringir el registro público y bloquear la instancia exclusivamente para tu uso personal, establece `VITE_PRIVATE_INSTANCE=true`.

### 6. Aplicar las migraciones de base de datos
```bash
pnpm wrangler d1 execute revolt-pass-db --file=schema.sql --remote
```

### 7. Compilar y Desplegar
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
| **[04-ADRS.md](./docs/es/04-ADRS.md)** | **[04-ADRS.md](./docs/en/04-ADRS.md)** | Registros de decisiones arquitectónicas (ADR-001 a ADR-014) |
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

## 🤝 Contribuciones y Seguridad

Agradecemos las contribuciones de la comunidad. Por favor, consulta nuestra **[Guía de Contribución](./CONTRIBUTING.es.md)** (*or [English Contributing Guide](./CONTRIBUTING.md)*) antes de enviar un Pull Request.

### 🔒 Política de Seguridad y Divulgación Responsable
Para reportar vulnerabilidades de seguridad, por favor **NO abras un issue público**. Utiliza la herramienta confidencial de **Reportes Privados de Vulnerabilidades de GitHub** o consulta nuestra política completa en **[SECURITY.es.md](./SECURITY.es.md)** (*or [English Security Policy](./SECURITY.md)*).

---

## 📄 Licencia y Política de Marca Registrada

Este proyecto es software libre distribuido bajo los términos de la **[GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE)**. Consulta el archivo [`LICENSE`](./LICENSE) para el texto legal completo.

### 🛡️ Política de Marca y Activos (Trademark & Brand Policy)
El código fuente es abierto, pero los nombres **"Revolt"**, **"Revolt Group"**, **"Revolt Pass"**, los logotipos, iconos, gráficos y dominios asociados son marcas y activos protegidos de **Revolt Group**:
* **Uso no permitido:** No se concede licencia de marca para el uso de estos nombres o logos en bifurcaciones (forks), versiones modificadas o servicios comerciales derivados sin autorización previa expresa por escrito.
* **Derivados y Forks:** Si creas o distribuyes una versión modificada o servicio derivado basado en este código, estás obligado por la Sección 7(e) de la licencia a renombrar el software con un nombre claramente diferenciado y reemplazar todos los logotipos y elementos gráficos oficiales.
* **Atribución:** Debes preservar todos los avisos de copyright originales y la atribución a Revolt Group conforme a las Secciones 7(b) y 7(c) de la AGPLv3.
