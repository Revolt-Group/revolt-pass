# Architecture Decision Records (ADRs)
## Proyecto: Revolt Pass — Zero-Knowledge 2FA & Security Vault

| Metadato | Detalle |
| :--- | :--- |
| **Identificador de Documento** | `RP-ADR-004` |
| **Versión** | `1.2.1-PROD` |
| **Estado** | Aprobado / Registro Vivo de Decisiones de Arquitectura |
| **Estándar de Formato** | Nygard / MADR (Markdown Architectural Decision Records) |
| **Licencia** | GNU AGPLv3 + Política de Marca Registrada (Revolt Group) |

---

## Índice de Decisiones Arquitectónicas

- [ADR-001: Adopción de Progressive Web App (PWA) con `vite-plugin-pwa` frente a Aplicación Nativa (Electron / Tauri / Móvil)](#adr-001-adopción-de-progressive-web-app-pwa-con-vite-plugin-pwa-frente-a-aplicación-nativa-electron--tauri--móvil)
- [ADR-002: Infraestructura Serverless Edge con Cloudflare Workers + Cloudflare D1 frente a Supabase o Backend Tradicional](#adr-002-infraestructura-serverless-edge-con-cloudflare-workers--cloudflare-d1-frente-a-supabase-o-backend-tradicional)
- [ADR-003: Web Crypto API Nativa (`crypto.subtle`) frente a Librerías Criptográficas de Terceros (CryptoJS / Node Crypto)](#adr-003-web-crypto-api-nativa-cryptosubtle-frente-a-librerías-criptográficas-de-terceros-cryptojs--node-crypto)
- [ADR-004: Arquitectura Criptográfica Zero-Knowledge en Cliente con AES-256-GCM y PBKDF2](#adr-004-arquitectura-criptográfica-zero-knowledge-en-cliente-con-aes-256-gcm-y-pbkdf2)
- [ADR-005: Desbloqueo Rápido Local mediante WebAuthn / Platform Authenticator (Windows Hello con PIN / Biometría Móvil)](#adr-005-desbloqueo-rápido-local-mediante-webauthn--platform-authenticator-windows-hello-con-pin--biometría-móvil)
- [ADR-006: Persistencia Local Estructurada con IndexedDB (`idb`) frente a `localStorage` / `sessionStorage`](#adr-006-persistencia-local-estructurada-con-indexeddb-idb-frente-a-localstorage--sessionstorage)
- [ADR-007: Internacionalización Bilingüe (i18n ES/EN) Zero-Knowledge con Tipado Estricto](#adr-007-internacionalización-bilingüe-i18n-esen-zero-knowledge-con-tipado-estricto)
- [ADR-008: Ciclo de Vida Multidispositivo, Revocación Granular de Sesiones y Eliminación Remota de Passkeys FIDO2](#adr-008-ciclo-de-vida-multidispositivo-revocación-granular-de-sesiones-y-eliminación-remota-de-passkeys-fido2)
- [ADR-009: Adopción de la Licencia GNU AGPLv3 con Política Restrictiva de Marcas Registradas](#adr-009-adopción-de-la-licencia-gnu-agplv3-con-política-restrictiva-de-marcas-registradas)

---

## ADR-001: Adopción de Progressive Web App (PWA) con `vite-plugin-pwa` frente a Aplicación Nativa (Electron / Tauri / Móvil)

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Revolt Pass debe estar disponible y ofrecer una experiencia indistinguible de una app nativa en múltiples entornos de escritorio (Windows 10/11, macOS, Linux) y dispositivos móviles (iOS y Android), permitiendo instalación en la pantalla de inicio, soporte de atajos de teclado, ejecución 100% offline y actualizaciones instantáneas sin fricción de tiendas de aplicaciones (*App Stores*).

### Factores Clave de Decisión (Drivers)
1. **Velocidad de Iteración y Código Único:** Mantener una base de código común (TypeScript + React) para todas las plataformas.
2. **Consumo de Recursos del Sistema:** Evitar el impacto masivo de memoria RAM característico de empaquetadores basados en Chromium completo (Electron suele consumir 150 MB - 300 MB de RAM en reposo).
3. **Distribución Soberana y Despliegue Inmediato:** Posibilidad de desplegar correcciones de seguridad de emergencia al subdominio `https://<tu-dominio-o-subdominio>.workers.dev` en segundos, sin esperar procesos de aprobación de Apple App Store o Google Play Store.
4. **Acceso a Hardware Criptográfico:** Disponibilidad de Web Crypto API y WebAuthn (FIDO2) dentro del estándar web moderno en todos los navegadores principales.

### Alternativas Evaluadas

#### 1. Progressive Web App (PWA) con Vite y Workbox (Opción Seleccionada)
* **Ventajas:**
  * Base de código única para escritorio y móviles.
  * Instalable de forma nativa en Windows con integración en el Menú Inicio y barra de tareas.
  * Cero consumo de disco adicional (pesa menos de 2 MB en caché local).
  * Funcionamiento 100% offline gracias a Workbox Service Worker.
  * Las actualizaciones se aplican de manera atómica e inmediata tras la recarga del navegador.
* **Desventajas:**
  * Restricciones de sandboxing del navegador (no puede escribir directamente en el sistema de archivos del SO sin interacción explícita del usuario).
  * En iOS Safari, las PWAs tienen políticas más estrictas de retención de caché si permanecen inactivas durante muchas semanas (mitigado mediante IndexedDB persistente).

#### 2. Electron
* **Ventajas:** Acceso sin restricciones a APIs nativas de Node.js y sistema de archivos.
* **Desventajas:**
  * Tamaño del instalador exorbitante (>80 MB para una utilidad de contraseñas).
  * Consumo inaceptable de RAM (>200 MB).
  * No cubre directamente teléfonos móviles (requeriría desarrollo adicional en React Native o Flutter).

#### 3. Tauri (Rust + Webview)
* **Ventajas:** Binarios ultraligeros (<10 MB) y bajo consumo de memoria en escritorio.
* **Desventajas:**
  * Soporte móvil aún en maduración y con mayor complejidad de compilación cruzada.
  * Requiere cadena de herramientas de Rust instalada en los entornos de CI/CD.
  * Mayor sobrecarga para despliegues web directos en `<tu-dominio.com>`.

### Decisión
Se adopta **Progressive Web App (PWA)** utilizando `@vite-pwa/vite-plugin-pwa` y Workbox. Permite instalar la app de forma transparente en Windows como una aplicación de ventana independiente con soporte total de **Windows Hello**, y en móviles vía "Agregar a pantalla de inicio".

---

## ADR-002: Infraestructura Serverless Edge con Cloudflare Workers + Cloudflare D1 frente a Supabase o Backend Tradicional

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
El sistema requiere un backend de sincronización confiable, con presencia global y latencia de red mínima para atender solicitudes en milisegundos desde cualquier ubicación geográfica. Dado que es un proyecto soberano personal con arquitectura Zero-Knowledge, el backend no necesita ejecutar lógica de negocio compleja ni cómputos criptográficos; su rol es actuar como un intermediario REST de alta disponibilidad para persistir y entregar blobs binarios cifrados.

### Factores Clave de Decisión (Drivers)
1. **Cero Costo Operativo (Free Tier Sostenible):** Operar indefinidamente dentro de la capa gratuita sin tarjetas de crédito que cobren por capacidad inactiva.
2. **Latencia en el Borde (Edge Latency):** Respuesta inmediata (<20ms) desde cualquier nodo CDN global.
3. **Simplicidad Operativa:** Cero gestión de contenedores Docker, parches de SO o aprovisionamiento de bases de datos PostgreSQL.
4. **Respaldo y Seguridad de Nube:** Integración nativa con Cloudflare WAF, protección contra DDoS y certificados TLS 1.3 automáticos.

### Alternativas Evaluadas

#### 1. Cloudflare Workers + Cloudflare D1 (Opción Seleccionada)
* **Ventajas:**
  * Motor SQLite serverless distribuido nativamente sobre la red perimetral de Cloudflare.
  * Generosa cuota gratuita: 100,000 requests/día en Workers, 5,000,000 lecturas/día y 100,000 escrituras/día en D1.
  * Latencia de frío (*cold start*) de 0 ms gracias a V8 Isolates.
  * El dominio `<tu-dominio.com>` ya reside sobre los servidores DNS de Cloudflare, facilitando el ruteo directo.
  * Esquema relacional SQL simple con transacciones ACID completas.
* **Desventajas:**
  * Tamaño máximo de base de datos de 5 GB en tier gratuito (absolutamente irrelevante para este proyecto, ya que la bóveda completa consume menos de 1 MB).
  * Ecosistema Serverless atado a la API de Wrangler (mitigado porque las consultas SQL preparadas son portables a cualquier SQLite estándar).

#### 2. Supabase (PostgreSQL autohospedado o cloud)
* **Ventajas:** Ecosistema completo de autenticación y Row Level Security (RLS).
* **Desventajas:**
  * Complejidad innecesaria: Las características de autenticación y RLS de Supabase son redundantes y contraproducentes en un modelo Zero-Knowledge donde el cliente ya controla su propia criptografía.
  * En la capa gratuita, los proyectos inactivos de Supabase se pausan automáticamente tras 7 días, obligando a reanudaciones manuales lentas.

#### 3. Backend Tradicional en VPS (Node.js + Fastify + PostgreSQL)
* **Ventajas:** Control absoluto sobre el entorno Linux.
* **Desventajas:**
  * Costo mensual fijo de hosting ($5 - $10 USD/mes).
  * Mantenimiento de parches del sistema operativo, cortafuegos y renovaciones manuales de Let's Encrypt.
  * Punto único de falla geográfico frente a la red Anycast mundial de Cloudflare.

### Decisión
Se selecciona **Cloudflare Workers en conjunto con Cloudflare D1**, administrado mediante `wrangler`. Representa la solución con menor latencia, mayor resiliencia y cero costos fijos.

---

## ADR-003: Web Crypto API Nativa (`crypto.subtle`) frente a Librerías Criptográficas de Terceros (CryptoJS / Node Crypto)

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Históricamente, muchas aplicaciones web han dependido de bibliotecas de JavaScript puro como `crypto-js`, `forge` o `elliptic` para operaciones de hashing y cifrado. Estas bibliotecas acarrean graves riesgos de vulnerabilidad a ataques de canal lateral por tiempo (*timing attacks*), ineficiencias de rendimiento y aumento desmedido del tamaño del paquete final (*bundle size*).

### Factores Clave de Decisión (Drivers)
1. **Inmunidad a Canales Laterales:** Operaciones criptográficas implementadas en tiempo constante (*constant-time*).
2. **Rendimiento Criptográfico Máximo:** Aceleración por hardware (instrucciones CPU AES-NI y SHA Extensions).
3. **Auditoría y Confianza de Código:** Eliminar el riesgo de ataques a la cadena de suministro (*supply chain attacks*) a través de paquetes npm maliciosos.
4. **Optimización de Bundle:** Tamaño de paquete cero para la suite de criptografía.

### Alternativas Evaluadas

#### 1. Web Crypto API Nativa (`window.crypto.subtle`) (Opción Seleccionada)
* **Ventajas:**
  * Especificación oficial W3C implementada directamente en el motor nativo del navegador (C++/Rust).
  * Ejecución acelerada por hardware: PBKDF2 y AES-GCM corren a velocidades de código máquina nativo.
  * Inmunidad intrínseca a ataques de temporización en operaciones de cifrado simétrico y verificación de HMAC.
  * Cero kilobytes añadidos al paquete de distribución de la aplicación.
  * Llaves marcadas como `extractable: false` residen aisladas en memoria protegida del navegador.
* **Desventajas:**
  * Requiere contexto seguro (`https://` o `localhost`), lo cual está garantizado por diseño en `<tu-dominio.com>`.
  * La API es asíncrona basada en `Promise`, lo que exige una estructura de código rigurosa.

#### 2. CryptoJS (`crypto-js`)
* **Ventajas:** Sintaxis síncrona simple y amplio historial en proyectos legados.
* **Desventajas:**
  * Proyecto no mantenido activamente con serias vulnerabilidades de temporización.
  * Rendimiento pésimo en JavaScript puro: calcular 600,000 iteraciones de PBKDF2 en CryptoJS congelaría la pestaña del navegador por más de 15 segundos.
  * Añade ~50 KB al bundle final sin aportar garantías criptográficas formales.

### Decisión
Se estipula el uso **exclusivo de la Web Crypto API nativa** para todas las primitivas criptográficas (`subtle.deriveKey`, `subtle.encrypt`, `subtle.decrypt`, `subtle.sign`, `getRandomValues`). Queda prohibida la instalación de dependencias de terceros para operaciones de cifrado.

---

## ADR-004: Modelo Zero-Knowledge con AES-256-GCM en Cliente

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
La arquitectura debe salvaguardar la privacidad absoluta de los secretos 2FA y los códigos de recuperación ante cualquier escenario de compromiso de la infraestructura de Cloudflare, intercepción de tráfico de red o auditorías externas.

### Factores Clave de Decisión (Drivers)
1. **Principio de Mínimo Privilegio y Desconfianza:** Tratar el backend como un canal intrínsecamente hostil.
2. **Integridad Autenticada:** Asegurar que los datos no puedan ser alterados en reposo sin ser detectados.
3. **Cumplimiento de Privacidad:** Cumplir por diseño con las directivas más estrictas de protección de datos (GDPR / LGPD) al no poseer el servidor la capacidad técnica de descifrar la información del usuario.

### Decisión
Se implementa un modelo **Zero-Knowledge estricto**:
1. Toda la información sensible del usuario (cuentas, secretos Base32, códigos de recuperación, notas, tags) se empaqueta en una única estructura de datos en memoria cliente.
2. Esta estructura se cifra con **AES-256-GCM** utilizando la clave derivada de la Contraseña Maestra (PBKDF2-SHA256 con 600,000 rondas).
3. Cada guardado produce un vector de inicialización (IV) único de 12 bytes.
4. El servidor de Cloudflare almacena y sincroniza únicamente `{ user_id, encrypted_blob, iv, version, updated_at }`.

### Consecuencias
* **Positivas:**
  * Si la base de datos de Cloudflare es extraída en su totalidad, la información sustraída es completamente inútil para el atacante.
  * El sistema no requiere esquemas de enmascaramiento complejos en base de datos.
* **Negativas / Riesgos:**
  * Si el usuario olvida su Contraseña Maestra y no posee la credencial biométrica local ni un respaldo en texto plano, los datos son irrecuperables por diseño. No existe procedimiento de "restablecer contraseña" en el servidor.

---

## ADR-005: Desbloqueo Rápido Local mediante WebAuthn / Platform Authenticator (Windows Hello con PIN / Biometría Móvil)

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Tipear una Contraseña Maestra de 20+ caracteres decenas de veces al día genera fatiga de seguridad en el usuario y propicia el uso de contraseñas débiles. En estaciones de trabajo Windows de escritorio sin hardware biométrico dedicado (cámaras infrarrojas o sensores dactilares), los usuarios desbloquean su sistema operativo mediante un **PIN de Windows Hello**. Es necesario habilitar el desbloqueo rápido seguro aprovechando este mecanismo nativo, al igual que Touch ID / Face ID en macOS y teléfonos móviles.

### Decisión
Se adopta el estándar **WebAuthn Level 3** configurando `authenticatorAttachment: "platform"` y `userVerification: "required"`.
* En Windows 10/11, el navegador invoca el diálogo de seguridad de Windows solicitando el **PIN de Windows Hello**.
* Una clave simétrica de envoltura (*wrapping key*) derivada localmente cifra la clave maestra en IndexedDB.
* La aserción exitosa de WebAuthn libera la clave de envoltura para descifrar la clave maestra en la memoria RAM volátil.
* Esta funcionalidad opera como un atajo de conveniencia local: la credencial WebAuthn no se sincroniza entre dispositivos diferentes. Cada nuevo dispositivo debe autenticarse inicialmente con la Contraseña Maestra.

---

## ADR-006: Persistencia Local Estructurada con IndexedDB (`idb`) frente a `localStorage` / `sessionStorage`

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
La aplicación requiere almacenar el blob cifrado de la bóveda, la clave de envoltura WebAuthn y los parámetros KDF en el dispositivo cliente para garantizar el funcionamiento offline.

### Alternativas Evaluadas
1. **`localStorage`:** Síncrono, bloquea el hilo principal en lecturas/escrituras, limitado a ~5 MB de strings UTF-16, accesible directamente por cualquier script síncrono.
2. **`IndexedDB` (con envoltura `idb`):** Asíncrono, transaccional, admite tipos binarios directos (`ArrayBuffer`, `Uint8Array`), capacidad de almacenamiento prácticamente ilimitada (hasta el 60% del disco disponible en el perfil del navegador).

### Decisión
Se adopta **IndexedDB mediante la librería minimalista y tipada `idb`**. Proporciona transacciones seguras sin bloquear la interfaz visual de React y facilita la gestión de colas de sincronización offline estructuradas.

---

## ADR-007: Internacionalización Bilingüe (i18n ES/EN) Zero-Knowledge con Tipado Estricto

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Revolt Pass requiere operar de forma nativa en Español e Inglés sin poner en riesgo la privacidad de los secretos 2FA ni depender de librerías pesadas en tiempo de ejecución o APIs de traducción en la nube que vulneren la premisa Zero-Knowledge.

### Decisión
1. **Diccionarios Síncronos Compilados:** Se implementan diccionarios estáticos TypeScript en `src/i18n/locales/es.ts` y `en.ts`, empaquetados en el bundle del cliente sin latencia de red.
2. **Validación Tipográfica Estricta:** Mediante `TranslationSchema` y dot-notation tipada, cualquier omisión de clave en cualquiera de los idiomas o discordancia en parámetros de interpolación (`{{count}}`, `{{issuer}}`) genera un error en tiempo de compilación con `tsc -b`.
3. **Persistencia Local Segura:** La preferencia se almacena en `localStorage.revolt_lang` con fallback a detección de idioma del navegador, sin telemetría externa.

---

## ADR-008: Ciclo de Vida Multidispositivo, Revocación Granular de Sesiones y Eliminación Remota de Passkeys FIDO2

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Al cerrar sesión remotamente desde un dispositivo ajeno, si el autenticador de plataforma (Windows Hello / biometría) mantiene la Passkey registrada, un usuario local podría intentar re-autenticarse. Además, el usuario necesita nombrar e identificar inequívocamente cada dispositivo y cada Passkey.

### Decisión
1. **Separación de Sesiones y Passkeys en D1:** Se modelan dos tablas independientes (`sessions` y `passkeys`) en Cloudflare D1.
2. **Revocación Remota e Individual:** Endpoints dedicados `DELETE /api/auth/sessions/:id` y `DELETE /api/passkeys/:id` permiten anular sesiones y eliminar la credencial biométrica remotamente, neutralizando cualquier intento de reingreso local en PCs ajenas.
3. **Persistencia Dual Permanente de Nombres:** Los nombres asignados por el usuario se persisten de forma concurrente en D1 y en `LocalUserConfig` de IndexedDB, y las sentencias SQL de upsert/touch preservan los nombres existentes mediante cláusulas condicionales.

---

## ADR-009: Adopción de la Licencia GNU AGPLv3 con Política Restrictiva de Marcas Registradas

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
El autor desea liberar el proyecto a la comunidad de código abierto para auditoría de seguridad y auto-alojamiento soberano, pero exige:
1. Impedir que empresas o terceros cierren el código o lucren comercialmente vendiendo el software o servicios SaaS propietarios sin compartir mejoras.
2. Evitar que terceros hagan pasar el proyecto por propio (apropiación o *white-labeling* indebido).

### Decisión
1. **GNU Affero General Public License v3.0 (AGPLv3):** Licencia copyleft fuerte que exige que cualquier persona o entidad que ofrezca Revolt Pass como servicio de red o distribuya versiones modificadas, deba poner a disposición el 100% del código fuente correspondiente bajo la misma licencia AGPLv3.
2. **Política de Marca Registrada (Trademark & Brand Policy bajo Sección 7(e)):** Se deniega expresamente la concesión de licencias sobre las marcas *"Revolt"*, *"Revolt Group"*, *"Revolt Pass"*, logotipos y dominios. Cualquier bifurcación (fork) o versión modificada está obligada legalmente a renombrar el software y retirar toda la identidad visual oficial.
