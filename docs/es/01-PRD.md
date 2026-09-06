# Product Requirements Document (PRD)
## Proyecto: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadato | Detalle |
| :--- | :--- |
| **Identificador de Documento** | `RP-PRD-001` |
| **Versión** | `1.2.1-PROD` |
| **Estado** | Aprobado / Especificación Canónica |
| **Organización** | Revolt Group |
| **Dominio Productivo** | `https://<tu-dominio-o-subdominio>.workers.dev` |
| **Repositorio Git** | `https://github.com/Revolt-Group/revolt-pass.git` |
| **Rama Primaria** | `main` |
| **Licencia / Distribución** | Software Libre Copyleft (GNU AGPLv3) + Política de Marca Registrada |

---

## 1. Resumen Ejecutivo y Declaración del Problema

### 1.1 Resumen Ejecutivo
**Revolt Pass** es una Progressive Web App (PWA) de clase empresarial diseñada bajo una arquitectura criptográfica **Zero-Knowledge (Conocimiento Cero)**. Su objetivo primordial es operar como una bóveda segura, soberana y de alta disponibilidad para la gestión de factores de autenticación de dos pasos (TOTP - RFC 6238), almacenamiento estructurado de claves de recuperación (*recovery codes*) y futura extensión hacia un gestor integral de credenciales.

El sistema se ejecuta en el cliente (navegador/dispositivo) aprovechando la **Web Crypto API** nativa de hardware y se sincroniza de manera bidireccional contra una infraestructura Serverless Edge en **Cloudflare Workers** respaldada por la base de datos relacional distribuida **Cloudflare D1**, operando estrictamente dentro de los límites del tier gratuito de Cloudflare sin incurrir en costos operativos fijos.

### 1.2 Declaración del Problema
1. **Riesgo Sistémico de Gestores Centralizados:** Incidentes recurrentes en la industria (ej. brechas masivas en proveedores comerciales propietarios) evidencian el peligro de confiar secretos criptográficos y bóvedas en servidores que procesan o almacenan metadatos y credenciales en texto plano o con llaves administradas por terceros.
2. **Fricción Operativa en Estaciones de Trabajo (Desktop / Windows):** Los ingenieros y operadores que trabajan en entornos de escritorio a menudo carecen de sensores biométricos de huella dactilar, lo que degrada la experiencia de usuario o los fuerza a recurrir a teléfonos móviles para obtener códigos de 6 dígitos. Es imperativo admitir autenticación nativa vía **Windows Hello (mediante PIN seguro o biometría)** a través del estándar FIDO2 / WebAuthn, equiparándose a Touch ID / Face ID en ecosistemas móviles.
3. **Pérdida Crítica de Recovery Codes:** La mayoría de las aplicaciones 2FA del mercado tratan los códigos de recuperación de un solo uso como notas desestructuradas o archivos de texto sueltos, provocando bloqueos de cuentas en situaciones de emergencia y desastres operativos.
4. **Desfase Horario (Time Drift):** Pequeñas discrepancias entre el reloj del dispositivo cliente y el reloj de los proveedores de identidad (IdP) causan rechazos esporádicos e inexplicables de tokens TOTP válidos.
5. **Vulnerabilidades de Superficie Local:** Persistencia involuntaria en el portapapeles del sistema operativo (*clipboard sniffing*) y exposición de datos en memoria RAM tras periodos prolongados de inactividad de la pantalla.

---

## 2. Propósito del Sistema y Principios Rectores

El diseño y desarrollo de Revolt Pass se rige de forma inflexible por cinco principios de ingeniería:

1. **Zero-Knowledge Absoluto (Client-Side Cryptography):** La infraestructura remota (Cloudflare Edge y D1) es tratada como un canal no confiable (*untrusted storage*). El servidor **únicamente almacena blobs binarios cifrados** con `AES-GCM-256`, un vector de inicialización (`IV`) y metadatos de sincronización. Las llaves maestras jamás abandonan la memoria RAM volátil del cliente.
2. **Offline-First Nativo:** El usuario debe poder autenticarse, consultar, generar y copiar códigos TOTP en el 100% de los casos, independientemente de la conectividad a Internet. La sincronización es un servicio en segundo plano que concilia estados asíncronos.
3. **Ergonomía de Grado Fortune 500:** Interfaz minimalista, Dark-Mode First, con latencia percibida nula (<16ms por frame), navegación fluida mediante teclado (Command Palette `Ctrl + K`), soporte para arrastrar y soltar códigos QR y respuesta háptica.
4. **Soberanía y Portabilidad de Datos:** El usuario es el único dueño de su información. El sistema proporciona mecanismos transparentes de exportación e importación en formatos abiertos estándar (JSON cifrado y JSON plano bajo advertencia explícita).
5. **Eficiencia en Recursos:** Optimización exhaustiva para mantenerse permanentemente dentro del tier gratuito de Cloudflare (CPU time <10ms por request, tamaño de base de datos <5GB, lecturas/escrituras minimizadas por diseño).

---

## 3. Alcance del Producto (Scope Management)

### 3.1 In-Scope (Alcance Comprometido para MVP v1.0)
* **Motor Criptográfico TOTP:** Soporte completo de RFC 6238 con HMAC-SHA1 y HMAC-SHA256, dígitos configurables (6 u 8), intervalos de rotación (default 30s) y decodificador Base32 puro RFC 4648 sin librerías externas obsoletas.
* **Cifrado Simétrico y KDF:** Derivación de clave mediante PBKDF2-SHA256 (600,000 iteraciones recomendadas por OWASP) y cifrado autenticado de la bóveda completa vía AES-256-GCM.
* **Autenticación Biométrica / Plataforma (WebAuthn / FIDO2):**
  * Soporte nativo para **Windows Hello** (utilizando PIN de Windows en equipos sin lector de huellas).
  * Soporte para **Biometría Móvil** (Touch ID, Face ID, Biometría de huella en Android).
  * Envoltura local de la llave de descifrado almacenada en IndexedDB para ofrecer funcionalidad de "Desbloqueo Rápido" (*Quick Unlock*).
* **Gestión Integrada de Códigos de Recuperación (Recovery Codes):**
  * Almacenamiento estructurado en cada cuenta (`code`, `used: boolean`).
  * Interfaz colapsable con enmascaramiento por defecto.
  * Marcado visual de códigos quemados/utilizados con un solo clic.
  * Copiado individual rápido al portapapeles.
* **Ingesta Flexible de Secretos 2FA:**
  * Escáner dinámico mediante cámara web o sensor móvil.
  * Zona interactiva Dropzone para arrastrar capturas de pantalla con códigos QR.
  * Pegado directo desde el portapapeles (`Ctrl + V`) de imágenes con códigos QR.
  * Formulario manual con sanitización y validación estricta de Base32.
* **Compensación de Desfase Horario (Time Drift Compensation):**
  * Sincronización milimétrica contra el timestamp UTC emitido por el Worker de Cloudflare.
  * Cálculo dinámico de delta temporal aplicado a la fórmula de generación TOTP.
* **Protección de Memoria y Superficie:**
  * Auto-lock por inactividad configurable (default 5 minutos, opciones: 1, 3, 5, 15 min).
  * Limpieza forzada de RAM ante evento `visibilitychange` prolongado o cierre de pestaña.
  * Auto-clear de portapapeles a los 45 segundos con verificación de integridad.
* **Productividad & UI:**
  * Command Palette (`Ctrl + K` / `Cmd + K`) para filtrado y copiado veloz.
  * Cuentas prioritarias fijadas en cabecera (`pinned`).
  * Detección automática y carga dinámica de logos oficiales mediante **Simple Icons CDN** con fallback a avatares con monograma y gradiente determinista.
  * Generador criptográfico de contraseñas seguras integrado (`crypto.getRandomValues`).
  * Respuesta háptica (`navigator.vibrate`) en dispositivos táctiles.
* **PWA & Offline:**
  * Service Worker con Workbox configurado para cache agresivo de activos estáticos.
  * Almacenamiento local mediante IndexedDB (`idb`).
  * Manifiesto Web completo e instalable en Windows, macOS, iOS y Android.
* **Sincronización Cloudflare:**
  * Endpoints REST en Cloudflare Workers con persistencia en Cloudflare D1.
  * Modelo de resolución de concurrencia optimista con detección de conflictos por versión.

### 3.2 Out-of-Scope (Diferido a Versiones Posteriores v2.0+)
* Bóvedas compartidas multifamiliares o empresariales multi-usuario (el MVP es monousuario soberano por instancia).
* Extensión para navegadores Chromium/Firefox con inyección de scripts en páginas de terceros.
* Integración con la API en tiempo real de HaveIBeenPwned (HIBP) para auditoría masiva de contraseñas.
* Soporte para tokens de hardware U2F propietarios que no implementen la capa estándar FIDO2/WebAuthn.

---

## 4. Requerimientos Funcionales Detallados

### RF-01: Motor de Cálculo TOTP (RFC 6238)
* **RF-01.1:** El sistema debe calcular el contador de pasos temporales $T$ como:
  $$T = \lfloor \frac{T_{local} + \Delta T_{drift} - T_0}{T_x} \rfloor$$
  donde $T_0 = 0$, $T_x = \text{periodo (default 30)}$, y $\Delta T_{drift}$ es el desfase en segundos respecto al servidor.
* **RF-01.2:** La decodificación del secreto debe realizarse a partir de Base32 canónico (RFC 4648, alfabeto `A-Z`, `2-7`), eliminando espacios en blanco y guiones automáticamente.
* **RF-01.3:** Debe soportar los algoritmos criptográficos `HMAC-SHA1` (predeterminado por compatibilidad global) y `HMAC-SHA256`.
* **RF-01.4:** La interfaz debe renderizar un indicador de progreso circular en SVG que se actualice a 60 FPS o 1 segundo de resolución, alertando visualmente en color ámbar/rojo en los últimos 5 segundos del ciclo.
* **RF-01.5:** Debe calcular preventivamente el código del siguiente ciclo para garantizar transiciones inmediatas sin latencia de render.

### RF-02: Gestión Estructurada de Códigos de Recuperación
* **RF-02.1:** Cada registro de la bóveda (`VaultItem`) podrá contener un arreglo opcional de objetos `{ code: string, used: boolean }`.
* **RF-02.2:** Por razones de seguridad operacional, los códigos deben mostrarse ofuscados (`••••••••••`) en la vista general y solo revelarse bajo demanda del usuario mediante un botón de alternancia (*toggle*).
* **RF-02.3:** El usuario podrá marcar o desmarcar un código como "usado", lo cual aplicará un estilo tachado y deshabilitado, persistiendo el cambio de inmediato en la bóveda local y programando la sincronización remota.
* **RF-02.4:** Al hacer clic en un código de recuperación individual, este debe copiarse al portapapeles, disparar el temporizador de auto-limpieza (RF-07) y emitir una notificación háptica/visual.

### RF-03: Derivación de Llaves y Cifrado Zero-Knowledge
* **RF-03.1:** El usuario definirá una Contraseña Maestra (*Master Password*) de alta entropía.
* **RF-03.2:** El sistema generará un `kdf_salt` criptográficamente seguro de al menos 16 bytes (128 bits) utilizando `crypto.getRandomValues`.
* **RF-03.3:** La clave de cifrado simétrica se derivará exclusivamente en el cliente mediante **PBKDF2 con HMAC-SHA256**, aplicando **600,000 iteraciones**.
* **RF-03.4:** El payload completo de la bóveda (todos los `VaultItem` serializados en JSON) se cifrará utilizando **AES-GCM de 256 bits** con un vector de inicialización (`IV`) único y aleatorio de 12 bytes por cada operación de guardado.
* **RF-03.5:** Está terminantemente prohibido almacenar la contraseña maestra o la clave derivada en texto plano en cualquier mecanismo de almacenamiento persistente (`localStorage`, `sessionStorage`, `IndexedDB`, `cookies`).

### RF-04: Desbloqueo Rápido vía WebAuthn / Passkeys
* **RF-04.1:** Tras el primer desbloqueo exitoso con la Contraseña Maestra, el usuario podrá enrolar su dispositivo en **WebAuthn / FIDO2**.
* **RF-04.2:** En estaciones de trabajo con Windows, el sistema utilizará el autenticador de plataforma integrado (**Windows Hello**), permitiendo el desbloqueo mediante **PIN numérico o biometría**.
* **RF-04.3:** En dispositivos móviles (Android/iOS) y macOS, utilizará el sensor biométrico nativo (Touch ID, Face ID o sensor dactilar Android).
* **RF-04.4:** Mecanismo de envoltura: La llave derivada de la bóveda se cifrará utilizando una clave local generada para WebAuthn y se almacenará protegida en IndexedDB. El acceso a dicha clave de envoltura requiere la verificación de usuario satisfactoria (`userVerification: "required"`).
* **RF-04.5:** Si el usuario reinicia el navegador o la sesión biométrica falla 3 veces, el sistema revertirá de inmediato solicitando la Contraseña Maestra completa.

### RF-05: Ingesta de Cuentas y Escáner QR
* **RF-05.1:** Debe parsear URIs estándar de autenticación:
  `otpauth://totp/[Issuer:]Account?secret=SECRET&issuer=Issuer&algorithm=SHA1&digits=6&period=30`
* **RF-05.2:** Módulo de escaneo en vivo mediante WebCam o cámara de smartphone con selector de cámara frontal/trasera.
* **RF-05.3:** Módulo Dropzone que permita soltar archivos de imagen (`.png`, `.jpg`, `.jpeg`, `.webp`).
* **RF-05.4:** Interceptor global del evento `paste` (`Ctrl + V`) que capture imágenes del portapapeles, procese el bitmap mediante decodificador QR y extraiga la URI sin necesidad de guardar archivos temporales en disco.
* **RF-05.5:** Formulario manual para creación y edición de cuentas con validación en tiempo real.

### RF-06: Compensación de Deriva Temporal (Time Drift Compensation)
* **RF-06.1:** Al inicializar la PWA y en cada reconexión de red, la aplicación consultará el endpoint ligero `GET /api/time`.
* **RF-06.2:** El cliente medirá la latencia de ida y vuelta (RTT) para determinar el desfase exacto:
  $$\Delta t = T_{servidor} - \left( T_{inicio\_req} + \frac{RTT}{2} \right)$$
* **RF-06.3:** El delta se mantendrá en memoria y se sumará transparentemente al reloj local del cliente en cada cómputo de TOTP.

### RF-07: Higiene de Memoria y Portapapeles
* **RF-07.1 Auto-Lock por Inactividad:** Un temporizador configurable purgará la llave criptográfica de la memoria RAM y devolverá la interfaz a la pantalla de bloqueo tras el periodo establecido sin interacción del usuario.
* **RF-07.2 Auto-Lock por Ocultamiento:** Si la pestaña o la ventana de la PWA pasa a segundo plano (`document.visibilityState === 'hidden'`) durante más de 10 minutos, el sistema forzará el bloqueo preventivo.
* **RF-07.3 Limpieza de Portapapeles:** Al copiar un código TOTP o de recuperación, se iniciará una cuenta regresiva de 45 segundos. Cumplido el plazo:
  * Si el contenido actual del portapapeles coincide con el secreto copiado, se sobreescribirá con una cadena vacía o espacios.
  * Si el usuario copió otro contenido ajeno en el interín, se abortará la sobrescritura para no destruir datos externos.

### RF-08: Command Palette y Búsqueda Rápida
* **RF-08.1:** Accesible universalmente mediante el atajo de teclado `Ctrl + K` (Windows/Linux) o `Cmd + K` (macOS).
* **RF-08.2:** Filtrado instantáneo por `issuer`, `account` o `tags` con tolerancia a errores tipográficos (*fuzzy search*).
* **RF-08.3:** Navegación por flechas direccionales (`ArrowUp`, `ArrowDown`) y selección con `Enter` para copiar inmediatamente el código TOTP y cerrar el modal.

### RF-09: Identidad Visual y CDN de Simple Icons
* **RF-09.1:** Normalización del campo `issuer` (ej. "Google LLC" $\to$ "google", "GitHub, Inc." $\to$ "github").
* **RF-09.2:** Invocación del CDN de Simple Icons: `https://cdn.simpleicons.org/{slug}`.
* **RF-09.3:** En caso de error HTTP 404 o falla de red, renderizado de un avatar vectorial con las iniciales de la cuenta sobre un gradiente de color derivado mediante el hash FNV-1a del nombre del proveedor.

### RF-10: Generador Criptográfico de Contraseñas
* **RF-10.1:** Generador integrado en modal dedicado y en edición de cuentas.
* **RF-10.2:** Generación exclusiva mediante `crypto.getRandomValues(new Uint32Array(n))`.
* **RF-10.3:** Controles para longitud (8 a 64 caracteres) y conjuntos de caracteres: mayúsculas, minúsculas, dígitos y símbolos especiales no ambiguos.
* **RF-10.4:** Cálculo y visualización en tiempo real de la entropía teórica en bits ($E = L \cdot \log_2(N)$).

### RF-11: Sincronización Remota Bidireccional
* **RF-11.1:** Persistencia de la versión local en IndexedDB.
* **RF-11.2:** Al detectar conexión o guardar cambios locales, se ejecutará una transacción contra `PUT /api/vault`.
* **RF-11.3:** Control de concurrencia optimista mediante el campo `version` monótonamente creciente. Si el servidor posee una versión superior, devolverá `409 Conflict`, activando el protocolo de reconciliación.

### RF-12: Respaldo, Exportación e Importación
* **RF-12.1:** **Exportación Cifrada (Recomendada):** Descarga de un archivo `.revolt.enc.json` que contiene el blob cifrado con la contraseña maestra y los metadatos de KDF, garantizando portabilidad segura.
* **RF-12.2:** **Exportación en Plano (Emergencia):** Descarga de un archivo JSON con los secretos descifrados. Requiere ingreso obligatorio de la Contraseña Maestra y confirmación mediante un modal crítico de advertencia destructiva.
* **RF-12.3:** **Importación:** Carga y validación estructural contra el esquema TypeScript canónico (`VaultItem[]`). Si faltan campos obligatorios, el proceso se aborta de forma segura sin corromper la base de datos existente.

### RF-13: Panel de Seguridad y Gestión Granular de Sesiones Multidispositivo
* **RF-13.1:** El sistema mantendrá un registro en Cloudflare D1 (`sessions`) para cada dispositivo autenticado, asociando un hash SHA-256 del token de sesión, dirección IP, User-Agent, fingerprint del navegador y marcas de tiempo (`created_at`, `last_active_at`).
* **RF-13.2:** La interfaz expondrá un modal de Seguridad y Auditoría (`SecurityModal`) que discrimina visualmente la sesión activa del dispositivo actual respecto a otras sesiones remotas.
* **RF-13.3:** El usuario podrá revocar sesiones de manera individual (`DELETE /api/auth/sessions/:id`) o masiva (`DELETE /api/auth/sessions`). Al revocar una sesión, cualquier petición subsecuente con ese token es rechazada de inmediato.
* **RF-13.4:** El usuario podrá renombrar sus dispositivos con nombres personalizados y familiares (ej. *"MacBook de Trabajo"*, *"PC de Escritorio Casa"*). Los nombres se conservan permanentemente tanto en la base de datos remota como en `LocalUserConfig` de IndexedDB, previniendo sobreescrituras en refrescos de fondo.

### RF-14: Gestión y Revocación de Hardware Passkeys (WebAuthn / FIDO2)
* **RF-14.1:** El modal de Seguridad listará todas las credenciales Passkey enroladas en la cuenta (`passkeys`), mostrando el nombre, fecha de creación, último uso y si corresponde al dispositivo en uso actual.
* **RF-14.2:** El usuario podrá personalizar el nombre de cada Passkey con persistencia permanente en el almacenamiento local IndexedDB y en Cloudflare D1.
* **RF-14.3:** **Revocación Remota de Passkeys:** El usuario podrá eliminar y revocar cualquier Passkey registrada (`DELETE /api/passkeys/:id`). Si una sesión fue revocada en una PC ajena, la eliminación remota de la Passkey asociada neutraliza de raíz cualquier posibilidad de reingreso biométrico o por PIN de Windows Hello en ese dispositivo.
* **RF-14.4:** **Eliminación de Bypass de Windows Hello:** Se mitiga la omisión involuntaria o forzada de la verificación biométrica obligando a la verificación estricta de la credencial antes de conceder acceso a la clave de descifrado local.

### RF-15: Subsistema de Internacionalización Bilingüe (i18n ES/EN) Zero-Knowledge
* **RF-15.1:** Soporte integral y simultáneo para **Español** e **Inglés** en todos los componentes, modales, alertas, generador de contraseñas, comandos de teclado y formatos de fecha/hora.
* **RF-15.2:** Cero fugas de información: las traducciones residen íntegramente en diccionarios estáticos compilados en el bundle cliente (`src/i18n/locales/`), sin llamadas a APIs externas de traducción ni telemetría que comprometan secretos.
* **RF-15.3:** Paridad tipográfica en compilación: `TranslationSchema` y claves dot-notation (`TranslationKey`) garantizan que la omisión de cualquier clave o parámetro de interpolación en cualquier idioma rompa el build de TypeScript.
* **RF-15.4:** Conmutador dinámico de idioma con autodetección de idioma preferido del navegador, persistencia en `localStorage` (`revolt_lang`) y alternador rápido en navbar, pantallas de login/lock y en la paleta de comandos (`Ctrl + K`).

### RF-16: Registro Inmutable de Auditoría de Seguridad (Audit Logs)
* **RF-16.1:** El Worker registrará eventos de seguridad en la tabla `audit_logs` (inicios de sesión, enrolamiento de passkeys, cierre de sesiones, revocaciones remotas y cambios de credenciales).
* **RF-16.2:** La interfaz presentará un historial cronológico de auditoría con formateo de fechas y horas adaptado al idioma seleccionado (`es-ES` / `en-US`), con deduplicación para prevenir saturación de registros ante sincronizaciones en segundo plano.

---

## 5. Requerimientos No Funcionales (RNF)

### RNF-01: Rendimiento y Latencia
* **Cómputo de Código TOTP:** Tiempo de ejecución inferior a **5 milisegundos** en cualquier CPU moderna.
* **Derivación KDF (PBKDF2 600k):** Tiempo de derivación inferior a **800 milisegundos** en hardware de escritorio estándar. Para no congelar la tasa de cuadros por segundo (FPS) de la interfaz de usuario, la derivación pesada debe ejecutarse en un **Web Worker** dedicado.
* **Tiempo de Inicio (First Contentful Paint):** Inferior a **1.2 segundos** sobre conexiones 3G simuladas gracias a los assets precacheados por el Service Worker.

### RNF-02: Disponibilidad y Modo Offline
* El 100% de las funciones de visualización de cuentas, cálculo de códigos TOTP, copiado al portapapeles y lectura de recovery codes debe estar garantizado sin acceso a Internet.
* Las modificaciones locales realizadas sin conexión deben almacenarse con bandera de estado `pending_sync` y despacharse automáticamente en el momento en que se recupere la conectividad (`navigator.onLine`).

### RNF-03: Gobernanza del Tier Gratuito de Cloudflare
El sistema debe operar de manera holgada dentro de los límites estrictos del nivel gratuito de Cloudflare:
* **Cloudflare Workers:** Límite de 100,000 peticiones diarias y 10 milisegundos de tiempo de CPU por solicitud. La compresión de datos y la arquitectura Zero-Knowledge garantizan tiempos de CPU menores a 2 milisegundos por invocación.
* **Cloudflare D1:** Límite de 5,000,000 de lecturas diarias, 100,000 escrituras diarias y 5 GB de almacenamiento total. Dado que una bóveda típica pesa menos de 500 KB, el consumo de espacio representa <0.01% de la cuota disponible.

### RNF-04: Seguridad y Confidencialidad
* **Arquitectura de Confianza Cero (Zero-Trust):** Ni los operadores de infraestructura, ni administradores de Cloudflare, ni atacantes que comprometan la base de datos D1 podrán descifrar los secretos de la bóveda sin poseer la Master Password.
* **Cifrado en Tránsito:** Enlace TLS 1.3 forzado a través de la red perimetral de Cloudflare con configuración HSTS estricta (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).
* **Content Security Policy (CSP):** Directivas restrictivas que impidan la inyección de scripts externos, limitando conexiones salientes únicamente al propio dominio y al CDN de Simple Icons.

### RNF-05: Usabilidad y Accesibilidad
* Cumplimiento estricto con el estándar **WCAG 2.1 Nivel AA**.
* Ratios de contraste de color superiores a 4.5:1 en elementos de texto y controles interactivos sobre fondo oscuro.
* Navegabilidad 100% asistida por teclado para personas con movilidad reducida o usuarios avanzados de escritorio.

### RNF-06: Compatibilidad Multiplataforma
* **Navegadores de Escritorio:** Google Chrome 120+, Microsoft Edge 120+, Mozilla Firefox 120+, Safari 17+.
* **Entornos Móviles:** Chrome para Android (versión reciente con soporte WebAuthn), Safari en iOS 17+.
* **Sistemas Operativos:** Windows 10/11 (soporte completo de Windows Hello con PIN), macOS Sonoma/Sequoia, Linux (Ubuntu/Fedora con Chromium/Firefox), Android 13+, iOS 17+.

---

## 6. Métricas de Éxito del Producto (KPIs de Ingeniería)

| Métrica | Objetivo Comprometido | Método de Medición |
| :--- | :--- | :--- |
| **Tiempo de Desbloqueo Rápido** | $< 400 \text{ ms}$ | Telemetría en cliente (`performance.measure`) |
| **Tasa de Éxito Offline** | $100\%$ | Validación mediante corte de red en DevTools |
| **Consumo de CPU en Worker** | $< 3.5 \text{ ms}$ | Cloudflare Worker Analytics |
| **Precisión de Time Drift** | $\pm 50 \text{ ms}$ de error máximo | Comparativa vs `Date.now()` ajustado |
| **Bundle Size Inicial (Gzipped)** | $< 180 \text{ KB}$ | Vite build report & Rollup visualizer |
