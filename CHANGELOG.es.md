# Registro de Cambios (Changelog)

Todos los cambios notables realizados en **Revolt Pass** se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se rige por [Control Semántico de Versiones (SemVer)](https://semver.org/lang/es/).

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
