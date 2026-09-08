# Registro de Cambios (Changelog)

Todos los cambios notables realizados en **Revolt Pass** se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se rige por [Control Semántico de Versiones (SemVer)](https://semver.org/lang/es/).

---

## [2.0.1] - 2026-09-08

### Añadido
- **Infraestructura de Comunidad y Salud Open Source en GitHub:**
  - Flujo de Integración Continua (CI) automatizado (`.github/workflows/ci.yml`) que ejecuta validación de linter, suite completa de pruebas unitarias y compilación de producción en cada push y pull request a `main`.
  - Configuración automatizada de actualización de dependencias con Dependabot semanal (`.github/dependabot.yml`).
  - Plantillas de incidencias estructuradas en YAML (`.github/ISSUE_TEMPLATE/`) para reportes de error y solicitudes de características con consideraciones de seguridad Zero-Knowledge, deshabilitando incidencias en blanco (`config.yml`).
  - Plantilla de contribución para Pull Requests (`.github/PULL_REQUEST_TEMPLATE.md`) con lista de verificación estricta de calidad, pruebas y seguridad criptográfica.
  - Configuración de patrocinio del proyecto (`.github/FUNDING.yml`) para GitHub Sponsors.
  - Código de Conducta Contributor Covenant v2.1 en español (`CODE_OF_CONDUCT.md`) e inglés (`CODE_OF_CONDUCT.en.md`).
- **Expansión Exhaustiva de la Suite de Pruebas (175/175 pruebas aprobadas):**
  - Adición de 32 pruebas unitarias e integración en 7 módulos críticos:
    - Exportadores: Formato Aegis JSON (`aegisExport.test.ts`), URI otpauth en texto plano (`otpauthExport.test.ts`) y Bitwarden CSV (`bitwardenExport.test.ts`).
    - Importadores: Decodificación de cargas de migración de Google Authenticator (`googleAuth.test.ts`), motor de reconciliación y resolución de conflictos (`reconcile.test.ts`) y detector automático de formatos (`detector.test.ts`).
    - Motor de sincronización: pruebas integradas de flujo pull/push y resolución de concurrencia (`syncEngine.test.ts`).
- **Proveedor de Cobertura de Código y Umbrales de Calidad (`vitest.config.ts`):**
  - Integración de `@vitest/coverage-v8` con umbrales estrictos en módulos críticos:
    - Núcleo criptográfico (`src/lib/crypto/**`): 75% líneas / 80% funciones / 65% ramas.
    - Núcleo de seguridad (`src/lib/security/**`): 80% líneas / 80% funciones.
    - Motor de sincronización (`src/lib/sync/**`): 75% líneas / 75% funciones.
  - Nuevos comandos npm: `pnpm test:coverage` y `pnpm test:watch`.
- **Metadatos Open Graph y Vista Previa Social:**
  - Banner Open Graph de alta resolución de 1200x630px (`public/og-image.png`) con emblema de escudo y distintivos de producto generado vía `scripts/generate-og-image.js`.
  - Etiquetas completas Open Graph y Twitter Card en `index.html` con interpolación dinámica de `%VITE_APP_DOMAIN%` y fallback en `vite.config.ts`.
  - Documentación de variable `VITE_APP_DOMAIN` en `.env.example`.

### Modificado
- **Pulido de Herramientas y Paquete:**
  - Especificación de requisitos en `engines` (`node >=20.0.0`, `pnpm >=9.0.0`) en `package.json`.
  - Incorporación de scripts de conveniencia en `package.json`: `lint:fix`, `typecheck` e `icons`.
  - Fortalecimiento de reglas de seguridad en Oxlint (`.oxlintrc.json`) prohibiendo `eval`, `implied-eval` y `new-func`, habilitando reglas TypeScript y variables globales de Node/Worker.
  - Actualización de insignias dinámicas en `README.md` y `README.en.md` para estado de CI, versión de API y tests aprobados.
- **Limpieza de Andamiaje y Correcciones:**
  - Eliminación de recursos de plantilla sin uso (`src/assets/react.svg` y `src/assets/vite.svg`).
  - Corrección de orden incondicional de React Hooks en `src/components/PolymorphicItemCard.tsx`.

---

## [2.0.0] - 2026-09-08

### Añadido
- **Suite Integral de Secretos (Motor Polimórfico de Secretos):**
  - Transformación integral de Revolt Pass: de un autenticador exclusivo de 2FA a un gestor integral de contraseñas, secretos y credenciales Zero-Knowledge.
  - Soporte nativo para 6 tipos canónicos de secretos:
    - `totp`: Tokens temporales con cuenta regresiva en vivo, compensación de desvío temporal RFC 6238 y gestor de códigos de respaldo.
    - `login`: Cuentas de acceso con usuario, contraseña revelable, temporizador de portapapeles (45s), generador CSPRNG, URL web, semilla 2FA integrada e historial de contraseñas anteriores.
    - `card`: Tarjetas de crédito y débito con titular, número enmascarado, detección automática de marca (Visa, Mastercard, Amex, Discover), fecha de vencimiento, visualización de CVV y PIN de cajero.
    - `note`: Notas seguras cifradas de extremo a extremo con formato enriquecido Markdown para información confidencial y frases semilla.
    - `server_key`: Claves SSH y claves de API para infraestructura con servidor, puerto, usuario, clave pública, clave privada protegida, frase de contraseña (passphrase) y token.
    - `identity`: Fichas de identidad personal con nombre, apellido, correo, teléfono, DNI / pasaporte y domicilio completo.
  - Retrocompatibilidad absoluta: las bóvedas existentes de versiones v1.0 a v1.5 se normalizan y migran automáticamente en cliente sin intervención del usuario.
- **Cifrado de Sobre por Elemento (`encrypted_key`):**
  - Cada elemento de la bóveda cuenta con una clave simétrica única e independiente de 256 bits (`item_key`), envuelta bajo la clave maestra del usuario (`${ivBase64}:${ciphertextBase64}`).
  - Establece la base criptográfica para el intercambio granular asimétrico mediante curvas elípticas ECDH en el hito v2.5.
- **Papelera de Reciclaje de 30 Días y Purga Criptográfica Automática:**
  - Eliminación suave que registra la marca de tiempo `deleted_at: timestamp`.
  - Purga criptográfica automática: los elementos con más de 30 días en la papelera se eliminan irreversiblemente de la memoria y del texto cifrado durante `encryptVault`.
  - Pestaña interactiva de papelera en `VaultList` con contadores, indicador de días restantes para purga, restauración en un clic, eliminación permanente individual y vaciado total de papelera.
- **Snapshots de Bóveda en Cloudflare D1 y Rollback Optimista (`src/worker/api.ts`):**
  - Archivado automático e instantáneo del estado anterior de la bóveda en cada `PUT /api/vault`, manteniendo un historial rotativo de los últimos 5 snapshots con depuración en cascada.
  - Endpoints dedicados: `GET /api/vault/snapshots` y `POST /api/vault/restore/:vault_version`.
  - Rollback consistente con OCC: la restauración asigna `current.version + 1`, garantizando el control de concurrencia optimista y activando la sincronización inmediata en todos los dispositivos vinculados.
  - Pestaña "Historial de Bóveda" en `SecurityModal` con etiquetas de versión, cantidad de elementos, fecha y restauración en 1 clic.
- **Kit de Emergencia Físico e Imprimible en Cliente (`src/lib/utils/emergencyKit.ts`):**
  - Generador HTML 100% offline que genera un documento de recuperación ante desastres de alto contraste para imprimir (`window.print()`).
  - Código QR vectorial SVG con URL de la instancia, ID de usuario y nombre de cuenta para vinculación rápida de nuevos dispositivos.
  - Recuadro demarcado para anotación manuscrita de la Contraseña Maestra e instrucciones claras de seguridad. La contraseña nunca se procesa, almacena ni imprime en texto plano.
  - Integración accesible mediante el componente `EmergencyKitModal.tsx` disponible directamente en el Modal de Seguridad.
- **Suite de Interfaz Polimórfica y Generador:**
  - `PolymorphicItemCard.tsx`: Renderizado adaptado para los 6 tipos de secretos con portapapeles seguro (purga a los 45s), revelación de contraseña y modo papelera.
  - `EditAccountModal.tsx`: Modal integral para crear y editar secretos con selector de tipos, generador seguro CSPRNG, auto-detección y guardado automático de historial de contraseñas (`recordPasswordHistory`).
  - `VaultList.tsx`: Filtros por categoría (`all`, `login`, `totp`, `card`, `note`, `server_key`, `identity`, `trash`), insignias con contadores y conmutador de vista cuadrícula/lista.

### Modificado
- Incremento de versión a `v2.0.0` en `package.json` y `src/constants/version.ts`.
- Migración del esquema Cloudflare D1 con las tablas `vault_snapshots` y `folders`.
- Validación completa de la suite de pruebas: **143 pruebas automáticas aprobadas** en 18 archivos de test.

---

## [1.5.0] - 2026-09-08

### Añadido
- **Núcleo Criptográfico de Derivación Argon2id (`src/lib/crypto/kdf.ts` y `kdf.worker.ts`):**
  - Actualización de la Función de Derivación de Clave Maestra (KDF) de PBKDF2 a **Argon2id** (recomendado por OWASP 2024: 64 MB de memoria, 3 iteraciones, 1 hilo de paralelismo) compilado a WebAssembly nativo mediante `hash-wasm`.
  - Inmunidad criptográfica ante ataques de fuerza bruta paralelos acelerados por clústeres de GPUs o ASICs, manteniendo una velocidad de derivación sub-400ms en dispositivos cliente estándar.
  - **Auto-Actualización Silenciosa en Segundo Plano:** Las cuentas legadas creadas con PBKDF2 se re-encriptan y migran de forma automática e imperceptible a Argon2id en su próximo inicio de sesión o desbloqueo, re-cifrando la bóveda y actualizando la columna `kdf_algorithm` en Cloudflare D1 mediante el endpoint atómico `POST /api/auth/upgrade-kdf`.
  - Re-empaquetado automático de passkeys: las credenciales biométricas locales (Windows Hello / Passkeys FIDO2) se re-cifran de forma transparente con la nueva clave maestra Argon2id sin solicitar confirmaciones al usuario.
  - Interfaz de actualización manual disponible en la pestaña de Notificaciones del Modal de Seguridad para usuarios que deseen verificar o adelantar la migración.
  - Retrocompatibilidad total: las cuentas legadas con PBKDF2 se descifran con normalidad y exhiben sus parámetros correspondientes.
- **Alertas Proactivas con Web Push Nativo Zero-Knowledge (`src/worker/push.ts` y `public/push-sw.js`):**
  - Notificaciones push instantáneas en tiempo real entregadas al dispositivo del usuario a través de la Push API nativa del navegador y el Service Worker dedicado (`push-sw.js`).
  - Costo operacional de $0 y cero creación de cuentas: notificaciones enviadas directamente desde el Worker de Cloudflare hacia los servidores push de los navegadores (Google FCM, Apple APNs, Mozilla Push) implementando RFC 8292 (VAPID) y RFC 8291 (cifrado AES-128-GCM) sin librerías pesadas ni intermediarios externos.
  - Claves VAPID generadas y persistidas de forma segura en la base de datos (`app_settings`), sin claves de servidor estáticas o expuestas.
  - Disparadores de alerta ante eventos críticos de higiene: inicio de sesión desde un país no reconocido (`NEW_COUNTRY`), nueva sesión activa (`NEW_SESSION`), revocación remota de sesión (`SESSION_REVOKED`) y registro de nueva passkey (`PASSKEY_ADDED`).
  - Arquitectura 100% Zero-Knowledge: las alertas contienen exclusivamente metadatos sanitizados de higiene (descripción del evento, nombre del dispositivo, país, timestamp), sin exponer jamás el contenido de la bóveda ni secretos.
- **Alertas por Correo Electrónico BYOK (Bring Your Own Key) (`src/worker/email.ts`):**
  - Configuración de alertas por correo manteniendo un estricto **costo de $0 USD** para el propietario de la instancia autohospedada:
    - **Resend (Recomendado):** El usuario ingresa su propia clave API gratuita de Resend (3,000 correos/mes sin costo).
    - **Cloudflare Email (`send_email`):** Conexión directa mediante Worker con advertencia explícita en la interfaz indicando que Cloudflare exige el plan Workers Paid ($5/mes) en la cuenta del usuario.
  - Plantillas de correo HTML responsive con estética oscura corporativa de Revolt Pass.
  - Selectores individuales de eventos: control granular para activar o silenciar alertas por nuevo país, nueva sesión, revocación de sesión o adición de passkeys.
  - Botones interactivos de prueba inmediata para Web Push y Correo dentro del Modal de Seguridad.
- **Pestaña de Notificaciones en el Modal de Seguridad (`src/components/SecurityModal.tsx`):**
  - Pestaña dedicada "Notificaciones" con estado en vivo del permiso push, controles de suscripción/desuscripción, configuración de credenciales de correo BYOK y diagnóstico del algoritmo KDF activo.
  - Insignias dinámicas de seguridad en la pantalla de bloqueo y pantalla de autenticación reflejando el motor criptográfico activo (`Argon2id 64MB` vs `PBKDF2 600K`).

### Modificado
- Incremento de versión a `v1.5.0` en `package.json` y `src/constants/version.ts`.
- Actualización del esquema de base de datos (`schema.sql`) incorporando la columna `kdf_algorithm` en `users`, así como las tablas `push_subscriptions`, `user_notification_settings` y `app_settings`.
- Ampliación de la suite de pruebas a **134 pruebas automatizadas pasando (100%)** en 17 suites de prueba, certificando la derivación Argon2id WASM, aislamiento criptográfico entre algoritmos, intercambio de claves VAPID, persistencia de preferencias de notificación y suscripción/desuscripción Web Push.

---

## [1.4.1] - 2026-09-07

### Añadido
- **Exportador Masivo de Cuentas en Carrusel de QRs (`src/lib/exporters/protobufEncoder.ts` & `QrCarouselModal.tsx`):**
  - Codificador de Protocol Buffers en TypeScript puro para generar URIs oficiales de migración `otpauth-migration://offline?data=...`.
  - Particionado inteligente de cuentas (lotes de 7 cuentas por QR) para garantizar máxima legibilidad óptica y escaneo ultra-rápido en cámaras móviles.
  - Carrusel interactivo multi-código con barra de progreso segmentada, contador ("Código 1 de 3"), controles con flechas de teclado (Izquierda/Derecha) y copia de la URI del lote.
  - Integración en `BackupModal.tsx` para transferir toda la bóveda directamente hacia Google Authenticator, Aegis, 2FAS u otra instancia de Revolt Pass sin cables ni archivos.
- **Visor de Código QR para Cuentas Individuales (`AccountQrModal.tsx`):**
  - Visor vectorial SVG de alto contraste para códigos QR estándar `otpauth://totp/...`.
  - Accesible mediante el botón "Ver QR" en `EditAccountModal.tsx` y desde el menú contextual (`···`) de cada tarjeta en `TotpCard.tsx`.
  - Muestra identidad del emisor, cuenta, insignias de algoritmo y dígitos, visualizador conmutable de secreto Base32 y botón de copiado directo.
  - 100% universal: escaneable por cualquier app de autenticación del mercado (Google Authenticator, Microsoft Authenticator, Apple Passwords, Aegis, 2FAS, Bitwarden, etc.).
- **Utilidad de Renderizado Vectorial SVG para QR (`src/lib/utils/qrRenderer.ts`):**
  - Renderizado vectorial nítido con `@zxing/library` incorporando zona de silencio (*quiet zone*) y fondo blanco de alto contraste para visibilidad impecable en modo oscuro o pantallas retina.

### Modificado
- Incremento de versión a `v1.4.1` en `package.json` y `src/constants/version.ts`.
- Ampliación de la suite de pruebas automatizadas a **114 pruebas** en 16 suites, validando serialización Protobuf, chunking en lotes, ida y vuelta (round-trip) y generación de URIs `otpauth://`.

---

## [1.4.0] - 2026-09-07

### Añadido
- **Motor de Importadores Universales (`src/lib/importers/`):**
  - Motor de análisis zero-knowledge en TypeScript puro compatible con 10 plataformas y formatos estándar del sector:
    - **Google Authenticator:** Decodificador binario Protobuf nativo para URLs de migración `otpauth-migration://offline?data=...`.
    - **Authy:** Analizador de exportaciones de la comunidad y copias de seguridad JSON de tokens.
    - **Aegis Authenticator:** Analizador de JSON en texto plano con detección inteligente de bóvedas cifradas por contraseña y advertencia explicativa.
    - **2FAS:** Analizador nativo para el formato de exportación JSON `.2fas`.
    - **Bitwarden:** Analizador de copias de seguridad en JSON y CSV RFC 4180 (extracción automática de campos `login_totp`).
    - **1Password:** Analizador para CSV y archivos 1PUX JSON (extracción de secciones `one-time password`).
    - **Proton Pass:** Analizador de copias de seguridad JSON y CSV (`totpUri` / `totp`).
    - **Ente Auth:** Analizador de exportaciones JSON.
    - **LastPass Authenticator:** Analizador de CSV (`extra` / `totp`).
    - **Listas de URIs Planas:** Analizador multilínea de URIs estándar `otpauth://totp/...` y `otpauth://hotp/...`.
  - Detección automática de formato mediante extensión de archivo y análisis heurístico de estructura.
  - Motor interactivo de reconciliación inteligente y cálculo de diferencias (`reconcile.ts`):
    - Clasificación de cuentas entrantes en `nuevas`, `duplicadas` y `conflictos` (mismo emisor/cuenta pero con secretos o parámetros dispares).
    - Estrategias de resolución configurables por el usuario: `conservar_existente` (mantiene secretos actuales de la bóveda), `sobrescribir` (actualiza con los secretos importados) y `conservar_ambos` (importa duplicados asignando identificadores únicos).
    - Tabla interactiva de previsualización con insignias de estado, logos de emisores, algoritmos, dígitos y parámetros antes de aplicar a la bóveda.
    - Soporte para arrastrar y soltar (drag-and-drop), explorador de archivos y modo de pegado directo de texto o URIs de migración.
    - Integración con el escáner QR de la cámara: escanear un QR de migración de Google Authenticator con múltiples cuentas abre directamente el flujo de reconciliación.
- **Exportadores Abiertos de Bóveda (`src/lib/exporters/`):**
  - Formatos abiertos de exportación además de las copias de seguridad nativas cifradas y en texto plano de Revolt:
    - **Aegis Authenticator JSON:** Copia JSON en formato estándar de Aegis para migración directa a autenticadores open source de Android.
    - **Bitwarden CSV:** Exportación en formato CSV compatible con la importación de Bitwarden.
    - **Lista Estándar `otpauth://`:** Lista de texto plano multilínea con URIs OTP estándar.
- **Soporte para Llaves Físicas YubiKey y FIDO2 Roaming (WebAuthn):**
  - Soporte de adjunto `cross-platform` en WebAuthn para llaves de seguridad físicas por hardware (YubiKey 5 Series, Feitian, SoloKeys, Nitrokey).
  - Compatibilidad multitransporte (`usb`, `nfc`, `ble`, `internal`).
  - Selector conmutable entre biometría de plataforma (Windows Hello, Touch ID, Face ID) y llaves de seguridad físicas durante el registro de passkeys en el Panel de Seguridad.
- **Exportación del Historial de Auditoría de Seguridad:**
  - Descarga en un solo clic del historial completo de eventos de seguridad en formato **CSV** o **JSON** desde el Panel de Seguridad.
- **Ventana Deslizante y Resiliencia en Tokens de Sesión:**
  - Migración en Cloudflare D1 agregando la columna `prev_token_hash` e índice asociado en la tabla `sessions`.
  - Ventana de gracia de 1 generación que permite a peticiones firmadas con el token inmediatamente anterior tener éxito ante rotaciones concurrentes en segundo plano.
  - Consulta reactiva y fresca del token en IndexedDB (`getUserConfig()`) para evitar errores en las pestañas de sesiones activas, passkeys e historial de seguridad.

### Modificado
- Incremento de versión a `v1.4.0` en `package.json` y `src/constants/version.ts`.
- Ampliación de la suite de pruebas automatizadas de 94 a **111 pruebas** en 15 suites, validando decodificadores Protobuf, los 10 importadores, estrategias de reconciliación y ventana de gracia deslizante en D1.

---

## [1.3.1] - 2026-09-07

### Seguridad y Endurecimiento (Hardening)
- **Cabecera Content-Security-Policy (CSP) (FIX-01):**
  - Implementación de cabecera CSP estricta en todas las respuestas de activos estáticos del Cloudflare Worker para mitigar Cross-Site Scripting (XSS / VEC-06).
  - Restricción de orígenes de scripts, fuentes, marcos y conexiones permitidas hacia CDNs de confianza (`cdn.simpleicons.org`).
- **Limitación de Tasa Perimetral (Rate Limiting) en Endpoints Sensibles (FIX-02):**
  - Integración del limitador de tasa nativo de Cloudflare Workers en `/api/auth/salt` y `/api/auth/register`.
  - Respuesta `HTTP 429 Too Many Requests` con cabecera `Retry-After: 60` ante excesos de peticiones, mitigando ataques de enumeración de nombres de usuario y registros automatizados.
  - Documentación de vinculación en `wrangler.toml.example`.
- **Restricción de Origen CORS al Dominio Productivo (FIX-03):**
  - Sustitución de CORS comodín permisivo (`*`) por una configuración dinámica que refleja `env.APP_DOMAIN` en entornos productivos.
  - Degeneración controlada a comodín únicamente en entornos de desarrollo local no configurados.
- **Rotación de Tokens de Sesión Deslizante (Sliding Session) en Sincronización (FIX-04):**
  - Rotación automática de credenciales de sesión en sincronizaciones de bóveda (`GET /api/vault` y `PUT /api/vault`).
  - El Worker emite la cabecera `X-New-Session-Token` con un nuevo hash criptográficamente aleatorio tras cada sincronización autenticada.
  - El cliente (`syncEngine.ts`) intercepta la cabecera y actualiza el token en IndexedDB (`user_config`).
  - Invalidación inmediata del hash de sesión anterior en Cloudflare D1, acotando drásticamente la ventana de exposición de tokens interceptados.
  - Ampliación deslizante de la expiración de la sesión en cada petición válida.

### Modificado
- Incremento de versión a `v1.3.1` en `package.json` y `src/constants/version.ts`.
- Ampliación de la suite de pruebas a **94 pruebas automatizadas** en 14 suites, validando cabeceras CSP, limitadores de tasa, CORS restringido y rotación de tokens de sesión.

---

## [1.3.0] - 2026-09-07

### Añadido
- **Motor de Diagnóstico de Higiene y Salud de la Bóveda (`vaultHygiene.ts`):**
  - Análisis en tiempo real en el cliente sobre las credenciales de la bóveda, evaluando entropía criptográfica, duplicación de secretos y redundancia de recuperación.
  - Detección de claves secretas TOTP duplicadas o reutilizadas en múltiples servicios.
  - Identificación de secretos Base32 débiles (<16 caracteres / <80 bits) vulnerables a ataques por fuerza bruta.
  - Verificación de cuentas sin códigos de respaldo o con todos los códigos consumidos.
  - Monitorización de obsolescencia de copias de seguridad con alerta si no se ha exportado un respaldo en más de 30 días.
  - Algoritmo de puntuación ponderada (0–100%) con escala cualitativa (*Excelente*, *Buena*, *Mejorable*, *Crítica*).
- **Detección de Filtraciones Zero-Knowledge vía k-Anonymity (`pwnedCheck.ts`):**
  - Verificación contra la base de datos de HaveIBeenPwned con más de 800 millones de contraseñas expuestas.
  - Cálculo local del hash SHA-1 utilizando la Web Crypto API nativa.
  - Modelo estricto de k-Anonymity: únicamente los primeros 5 caracteres hexadecimales del hash se envían al proxy perimetral.
  - La coincidencia exacta del sufijo (los 35 caracteres restantes) se resuelve 100% en el navegador del usuario.
  - Proxy perimetral en Cloudflare Worker (`GET /api/pwned-check`) con caché edge de 24 horas (`Cache-Control: public, max-age=86400`) y cabecera `Add-Padding: true` para mitigar ataques por análisis de longitud de respuesta.
- **Scorecard Visual de Salud y Pestaña de Diagnósticos (`SecurityModal.tsx`):**
  - Pestaña dedicada "Salud y Diagnóstico" en el Panel de Seguridad con medidor radial porcentual, etiquetas de severidad y tarjetas métricas.
  - Lista de recomendaciones accionables con accesos directos para respaldar o inspeccionar cuentas específicas.
  - Verificador interactivo de contraseñas filtradas con explicación transparente de la garantía Zero-Knowledge.
- **Rastreo Automático de Marcas de Tiempo de Respaldo:**
  - Registro de fecha y hora al exportar respaldos cifrados o en texto plano (`revolt_last_backup`).
  - Actualización reactiva instantánea ante eventos del navegador (`revolt:backup-updated`).

### Modificado
- Incremento de versión a `v1.3.0` en `package.json` y `version.ts`.
- Ampliación de la suite de pruebas automatizadas a 88 pruebas en 14 suites, cubriendo proxies k-Anonymity, parsing de rangos SHA-1 y algoritmos de higiene.
- Actualización de los roadmaps técnicos (`docs/es/05-ROADMAP.md` y `docs/en/05-ROADMAP.md`) marcando el Hito v1.3 como completado y en producción.

---

## [1.2.1] - 2026-09-06

### Añadido
- **Desacoplamiento de Repositorio Open-Source y Modo Instancia Privada:**
  - Variable de entorno `VITE_PRIVATE_INSTANCE` que permite el despliegue autónomo comunitario sin bloqueos de acceso privado.
  - Pantalla protectora de acceso restringido para la instancia oficial del autor con atajos discretos (`Ctrl + Alt + U`, `Ctrl + Shift + U` y triple clic en el escudo).
  - Trigger SQLite `BEFORE INSERT` en Cloudflare D1 como defensa en profundidad ante registros no autorizados.
- **Licenciamiento Integral y Protección de Marca:**
  - Adopción formal de la licencia **GNU Affero General Public License v3 (AGPL-3.0-only)** con la **Política de Marca Registrada (Sección 7(e))**.
  - Políticas de seguridad bilingües ([`SECURITY.md`](./SECURITY.md) y [`SECURITY.es.md`](./SECURITY.es.md)) enlazadas con los Reportes Privados de Vulnerabilidades de GitHub.
- **Reestructuración de Documentación:**
  - PRD, Arquitectura, Modelo de Amenazas, ADRs y Roadmap Técnico bilingües en `docs/en/` y `docs/es/`.

---

## [1.2.0] - 2026-09-05

### Añadido
- **Internacionalización Bilingüe Integral (i18n):**
  - Motor de traducción en cliente 100% Zero-Knowledge en Español (`es`) e Inglés (`en`).
  - Seguridad de tipos en tiempo de compilación mediante `TranslationSchema` y `TranslationPath`.
  - Detección automática del idioma del navegador con persistencia en `localStorage`.
  - Selector de idioma dinámico en la cabecera de navegación y pantallas de autenticación.

### Modificado
- Refactorización de todos los componentes visuales, modales, toasts y mensajes de error para consumir claves de traducción semánticas.

---

## [1.1.0] - 2026-09-04

### Añadido
- **Gestión Multidispositivo y Control de Sesiones (`SecurityModal.tsx`):**
  - Auditoría de sesiones remotas con identificación de tipo de dispositivo, país de origen y última hora de actividad persistidos en Cloudflare D1.
  - Revocación granular por dispositivo y botón de cierre masivo de sesiones ajenas.
  - Renombrado personalizado de dispositivos con sincronización en el cliente.
- **Administración de Passkeys FIDO2 y Biometría Local:**
  - Vinculación, renombrado y revocación remota de credenciales biométricas físicas y Windows Hello.
  - Encriptación de clave maestra envuelta (*wrapped key*) para desbloqueo local instantáneo sin contraseña maestra.
- **Registro Inmutable de Eventos Críticos:**
  - Historial de seguridad con registro inmutable de inicios de sesión, revocaciones y cambios en credenciales.

---

## [1.0.0] - 2026-09-03

### Añadido
- **Arquitectura Criptográfica Zero-Knowledge:**
  - Derivación de clave maestra en el cliente mediante PBKDF2 (600.000 iteraciones, SHA-256) en un Web Worker aislado.
  - Cifrado simétrico autenticado con AES-256-GCM para todos los secretos, cuentas y códigos de respaldo.
  - Backend en Cloudflare Workers y base de datos relacional Cloudflare D1: el servidor almacena únicamente blobs cifrados y verificadores de autenticación.
- **Persistencia Local y Sincronización Offline-First:**
  - Almacenamiento local mediante IndexedDB con compensación de desfase de reloj (`/api/time`).
  - Sincronización asíncrona automática en segundo plano al recuperar conectividad.
- **Mecanismos de Endurecimiento y Seguridad:**
  - Auto-bloqueo configurable por inactividad con purga total de claves en memoria RAM.
  - Guardián del portapapeles con borrado automático tras 45 segundos de copiado un código o secreto.
- **Experiencia de Usuario Moderna:**
  - Interfaz Dark-Mode First inspirada en Linear y Raycast.
  - Paleta de comandos universal (`Ctrl + K`).
  - Escáner de códigos QR por cámara web, arrastrar imagen o pegar desde portapapeles (`Ctrl + V`).
  - Exportación e importación de copias de seguridad cifradas en JSON.
  - Soporte integral como Progressive Web App (PWA) instalable en el sistema operativo.
