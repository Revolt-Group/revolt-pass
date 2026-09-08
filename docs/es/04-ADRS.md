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
- [ADR-010: Modo Desacoplado de Instancia Privada y Auto-alojamiento Comunitario (`VITE_PRIVATE_INSTANCE`)](#adr-010-modo-desacoplado-de-instancia-privada-y-auto-alojamiento-comunitario-vite_private_instance)
- [ADR-011: Diagnóstico de Higiene Preventivo y Detección de Brechas bajo k-Anonymity](#adr-011-diagnóstico-de-higiene-preventivo-y-detección-de-brechas-bajo-k-anonymity)
- [ADR-012: Endurecimiento Perimetral (CSP, Rate Limiting, CORS) y Sesiones Deslizantes con Rotación](#adr-012-endurecimiento-perimetral-csp-rate-limiting-cors-y-sesiones-deslizantes-con-rotación)
- [ADR-013: Ingesta Masiva Protobuf, Conciliación Diferencial y Exportadores Abiertos](#adr-013-ingesta-masiva-protobuf-conciliación-diferencial-y-exportadores-abiertos)
- [ADR-014: Adopción de ECDH P-384 para Compartición de Claves de Ítems](#adr-014-adopción-de-ecdh-p-384-para-compartición-de-claves-de-ítems)

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

---

## ADR-010: Modo Desacoplado de Instancia Privada y Auto-alojamiento Comunitario (`VITE_PRIVATE_INSTANCE`)

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Revolt Pass se publica como software libre bajo licencia AGPLv3 para que cualquier usuario o comunidad pueda auto-alojar su propio gestor 2FA soberano en Cloudflare Workers y D1.
Sin embargo, en la instancia oficial de producción desplegada por el autor, el servicio es de uso exclusivamente personal. Se requiere:
1. Permitir que la instancia pública oficial restrinja de manera inflexible el registro de nuevos usuarios extraños sin exponer información sensible.
2. Evitar introducir restricciones propietarias o hardcodeos en el código fuente que afecten negativamente a los usuarios de la comunidad que clonen o hagan *fork* del repositorio para sus propios servidores.
3. Permitir que el propietario legítimo pueda inicializar o registrar su cuenta en navegadores nuevos o sesiones privadas mediante un mecanismo discreto de autenticación previa.

### Alternativas Evaluadas
1. **Hardcodear la restricción en `schema.sql` y el código fuente:** Rompe la experiencia de los auto-alojadores de código abierto, obligándolos a modificar manualmente el código fuente para poder usar la aplicación.
2. **Autenticación por lista blanca en el servidor mediante Cloudflare Access:** Agrega dependencia de un servicio externo pago o de configuración compleja de Cloudflare Zero Trust, innecesario para un gestor de contraseñas cliente Zero-Knowledge.
3. **Desacoplamiento mediante variable de entorno en tiempo de compilación (`VITE_PRIVATE_INSTANCE`) + trigger de base de datos remoto:** Mantiene el repositorio completamente limpio y abierto por defecto (`VITE_PRIVATE_INSTANCE=false`), mientras que la instancia de producción activa el flag en su configuración local `.env.local` y activa un trigger `BEFORE INSERT` en su base de datos D1 remota.

### Decisión
Se adopta el **Desacoplamiento de Instancia Privada mediante `VITE_PRIVATE_INSTANCE` y Trigger Remoto D1**:
1. **Configuración Abierta por Defecto:** En `.env.example` y por defecto en el repositorio, `VITE_PRIVATE_INSTANCE=false`. Cualquier usuario que clone el proyecto dispone inmediatamente de una aplicación abierta con registro libre para su familia o comunidad.
2. **Capa Visual Restringida para Instancias Privadas:** Cuando `VITE_PRIVATE_INSTANCE=true` está configurado, la interfaz inicial de la aplicación se bloquea con una pantalla superpuesta (`Restricted Access Overlay`) informando que la instancia es privada, y tornando inerte el formulario inferior.
3. **Mecanismo de Desbloqueo del Propietario:** El propietario puede desactivar la pantalla restrictiva en cualquier momento mediante atajos de teclado globales en fase de captura (`Ctrl + Shift + U` o `Ctrl + Alt + U`) o mediante un triple clic discreto en el icono de escudo central.
4. **Defensa en Profundidad en el Backend:** En la base de datos de producción remota, un trigger SQLite bloquea cualquier inserción de usuarios adicionales a nivel de motor de almacenamiento, garantizando seguridad absoluta independientemente del frontend.

---

## ADR-011: Diagnóstico de Higiene Preventivo y Detección de Brechas bajo k-Anonymity

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Los usuarios almacenan secretos TOTP y contraseñas que pueden haber sido expuestos en brechas de datos masivas públicas o configurados con baja entropía. Se requiere alertar preventivamente sobre credenciales comprometidas y debilidades higiénicas sin revelar jamás ninguna contraseña, secreto o hash completo al servidor ni a APIs de terceros.

### Decisión
1. **k-Anonymity con HIBP (HaveIBeenPwned):** Se calcula localmente el hash SHA-1 de la credencial en el cliente. Únicamente los primeros 5 caracteres hexadecimales del hash (*hash prefix*) se envían a través de un proxy en Cloudflare Worker. El servidor externo devuelve una lista de sufijos coincidentes con sus frecuencias de brecha. La comparación final del sufijo se realiza de manera 100% local en memoria.
2. **Diagnóstico Local de Higiene:** Cálculo de entropía en bits de los secretos Base32, detección de cuentas duplicadas y advertencias de obsolescencia de backups (>30 días) ejecutados localmente sin transmitir telemetría.

---

## ADR-012: Endurecimiento Perimetral (CSP, Rate Limiting, CORS) y Sesiones Deslizantes con Rotación

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Para mitigar vectores de inyección XSS, ataques de fuerza bruta o enumeración de usuarios en endpoints de autenticación, y secuestro de sesiones persistentes en redes públicas, se requiere endurecer la frontera perimetral en el borde (Cloudflare Workers).

### Decisión
1. **Content-Security-Policy (CSP) Estricta:** Cabeceras CSP inmutables generadas por el Worker bloqueando scripts no autorizados, conexiones a orígenes ajenos y framing del sitio (`frame-ancestors 'none'`).
2. **Limitador de Tasa Perimetral (Rate Limiting):** Restricción de 10 peticiones/minuto en `/api/auth/salt` y `/api/auth/register` devolviendo `HTTP 429 Too Many Requests` con cabecera `Retry-After`.
3. **CORS Restrictivo:** Cabeceras `Access-Control-Allow-Origin` enlazadas a `env.APP_DOMAIN` en producción.
4. **Rotación Deslizante de Tokens con Ventana de Gracia (`prev_token_hash`):** En cada ciclo de sincronización, el token de sesión se rota. Para absorber la concurrencia entre pestañas o peticiones paralelas, el servidor conserva el hash del token anterior en `prev_token_hash` durante una ventana de gracia temporal.

---

## ADR-013: Ingesta Masiva Protobuf, Conciliación Diferencial y Exportadores Abiertos

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
La migración desde otros gestores (Google Authenticator, Bitwarden, Aegis, 2FAS, etc.) suele provocar fricción y riesgo de duplicación descontrolada de cuentas o pérdida de metadatos críticos como claves de recuperación.

### Decisión
1. **Decodificador Nativo Protobuf (TypeScript Puro):** Se implementa un analizador para la carga binaria de `otpauth-migration://offline?data=...` de Google Authenticator sin dependencias externas pesadas ni APIs de terceros.
2. **Diálogo de Conciliación Tridireccional:** Análisis previo de diferencias (`nuevas`, `duplicadas`, `conflictos`) con estrategias seleccionables (`conservar existentes`, `sobrescribir`, `conservar ambos`) y fusión de claves de recuperación.
3. **Exportación Universal y Abierta:** Generación de respaldos en Aegis JSON, Bitwarden CSV, listas de URIs `otpauth://` y carrusel de códigos QR binarios Google Authenticator para máxima interoperabilidad.

---

## ADR-014: Adopción de ECDH P-384 para Compartición de Claves de Ítems

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
Revolt Pass es tradicionalmente una bóveda personal monousuario. Sin embargo, en la operativa de equipos u organizaciones surgen secretos compartidos (ej. credenciales TOTP de organizaciones en GitHub, accesos a infraestructura de producción). Compartir estos secretos mediante canales externos (mensajería, documentos compartidos) destruye el modelo Zero-Knowledge. Se requiere permitir la compartición segura de ítems individuales entre usuarios de Revolt Pass garantizando que Cloudflare D1 jamás tenga acceso al secreto ni a las claves de descifrado.

### Alternativas Evaluadas
1. **Envío del secreto re-cifrado con la clave maestra del destinatario:**
   - Requiere que el remitente conozca la clave maestra del destinatario. Rompe Zero-Knowledge totalmente. **Descartada.**
2. **Clave simétrica compartida pre-acordada (PSK):**
   - Canal de distribución externo y no controlado. Imposibilidad de gestión de ciclo de vida o revocación escalable. **Descartada.**
3. **RSA-OAEP para encapsulamiento de clave:**
   - RSA-2048 considerado legacy; RSA-4096 presenta overhead de tamaño excesivo y limitaciones de contexto en Web Crypto API. **Descartada.**
4. **ECDH P-384 con HKDF-SHA256 y AES-256-GCM wrapping (Opción Seleccionada):**
   - Cada usuario genera un par de claves asimétricas ECDH sobre la curva estándar NIST P-384 nativa en la Web Crypto API.
   - La clave privada del usuario vive cifrada dentro de su propia bóveda personal.
   - La clave pública se almacena en D1 y es accesible para otros usuarios autenticados.
   - El remitente deriva un secreto compartido usando su clave privada y la clave pública del destinatario. Con HKDF-SHA256 deriva una clave de encapsulamiento (`wrapping_key` AES-256-GCM) que envuelve la clave simétrica única del ítem (`item_key`).
   - El servidor D1 solo almacena el blob del ítem cifrado y la clave del ítem encapsulada.

### Decisión
Se adopta **ECDH P-384 con HKDF-SHA256 para derivación de clave de encapsulamiento y AES-256-GCM para encapsulamiento de clave de ítem** (esquema ECIES nativo en Web Crypto API).
- El modelo es 100% Zero-Knowledge respecto al contenido: D1 solo almacena metadatos de relación y blobs cifrados.
- Requiere como precondición arquitectónica que el Hito v2.0 implemente el modelo de clave simétrica por ítem (`encrypted_key`).

---

## ADR-015: Adopción de Argon2id KDF (WASM) y Alertas Proactivas Web Push / BYOK Email

### Estado
**Aceptado (Accepted)**

### Contexto y Declaración del Problema
PBKDF2-HMAC-SHA256 (incluso a 600,000 iteraciones) es vulnerable a ataques masivos de fuerza bruta paralelizados en GPUs y clusters ASIC especializados debido a su ausencia de dureza en memoria (*memory-hardness*). OWASP y NIST recomiendan enérgicamente **Argon2id** como el estándar de oro moderno para la derivación de claves maestras. No obstante, los navegadores web aún no implementan Argon2id dentro de la Web Crypto API nativa.

Adicionalmente, eventos de seguridad críticos (inicios de sesión desde nuevos países o dispositivos no reconocidos, registro de passkeys, revocaciones remotas de sesión) requerían notificación inmediata al usuario. Los servicios comerciales tradicionales de notificaciones push y correo imponen costes recurrentes, modelos de suscripción o recopilación centralizada de identificadores personales, violando el principio fundacional de coste operacional de $0 y las garantías Zero-Knowledge de Revolt Pass.

### Alternativas Evaluadas
1. **Incrementar iteraciones de PBKDF2 a 1,000,000+:**
   - Sobrecarga el hilo del navegador sin resolver la vulnerabilidad fundamental frente a ataques con hardware ASIC/GPU de alta memoria. **Descartada.**
2. **Scrypt:**
   - Ofrece dureza en memoria pero presenta menor resistencia teórica a ataques de canal lateral y temporización que Argon2id, además de requerir bibliotecas con mayor huella. **Descartada.**
3. **Argon2id compilado a WebAssembly (`hash-wasm`) ejecutado en Web Worker (Opción Seleccionada):**
   - Implementa los parámetros recomendados por OWASP 2024: 64 MB de memoria RAM, 3 iteraciones y 1 hilo.
   - Ejecutado en un Web Worker dedicado para no bloquear la interfaz de usuario ni provocar caídas de frames en el DOM.
   - Incluye mecanismo de migración atómica transparente (*silent auto-upgrade*): las cuentas históricas creadas con PBKDF2 se re-derivan a Argon2id al iniciar sesión o desbloquear el baúl, actualizando sus salts, verifiers y passkeys biométricas mediante `POST /api/auth/upgrade-kdf` sin requerir intervención ni cambio de clave por parte del usuario.
4. **Web Push Nativo (RFC 8291 / RFC 8292) + Email BYOK (Opción Seleccionada):**
   - Web Push directo entre el navegador del usuario y el servidor Push del sistema operativo (Mozilla, Google FCM, Apple Push Services) utilizando VAPID RFC 8292 y cifrado de carga útil AES-128-GCM RFC 8291 implementado íntegramente con Web Crypto API pura en Cloudflare Workers, sin intermediarios de pago (Pusher, OneSignal).
   - Notificaciones por correo bajo el esquema **BYOK (Bring Your Own Key)**: los usuarios pueden configurar opcionalmente su propia clave API gratuita de Resend (3,000 correos/mes de por vida) o canalizar alertas a través de Cloudflare Email Workers (`send_email`), manteniendo el coste operativo del proyecto en $0 perpetuo y preservando el anonimato.

### Decisión
1. Adoptar **Argon2id (64 MB, 3 iteraciones, 1 hilo) vía WebAssembly (`hash-wasm`) en Web Worker** como la función de derivación de claves (KDF) por defecto para todo nuevo registro.
2. Implementar **auto-upgrade silencioso de KDF**: migración automática y atómica de PBKDF2 a Argon2id al desbloquear, con re-empaquetado de passkeys FIDO2/WebAuthn.
3. Desplegar **Web Push nativo RFC 8291/8292 en Cloudflare Workers** y soporte de **Email BYOK** para alertas de seguridad proactivas en tiempo real con coste operativo de $0.
