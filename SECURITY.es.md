# Política de Seguridad

> **Aviso de Idioma:** Esta es la versión en Español de la política de seguridad. Puedes consultar el documento principal en Inglés en: **[English Version (SECURITY.md)](./SECURITY.md)**.

La seguridad de tus secretos criptográficos y códigos 2FA es la máxima prioridad de **Revolt Pass**. Nos tomamos muy en serio cualquier vulnerabilidad y valoramos profundamente la cooperación de investigadores de seguridad y de la comunidad de código abierto para una divulgación coordinada y responsable.

---

## 🛡️ Versiones Compatibles

Solo la versión menor activa más reciente recibe parches de seguridad y triaje proactivo:

| Versión | Compatible         | Estado |
| :------ | :----------------- | :----- |
| `1.2.x` | :white_check_mark: | Soportada y Mantenida Activamente |
| `< 1.2` | :x:                | Fin de Ciclo de Vida (Actualización recomendada) |

---

## 🔐 Reportar una Vulnerabilidad

Si descubres una vulnerabilidad de seguridad o un defecto en la implementación criptográfica de Revolt Pass, **por favor NO abras un Issue, Discusión o Pull Request público.**

Utiliza uno de nuestros canales confidenciales de reporte:

### 1. Reportes Privados de Vulnerabilidades de GitHub (Recomendado)
Puedes reportar vulnerabilidades directamente a través de nuestro repositorio con total confidencialidad:
1. Dirígete a la pestaña **Security** de este repositorio en GitHub.
2. En la barra lateral, bajo la sección **Reporting**, haz clic en **Report a vulnerability**.
3. Completa el formulario de aviso de seguridad con los pasos técnicos de reproducción, análisis de impacto y prueba de concepto (PoC).

### 2. Correo Electrónico de Seguridad Directo
Si prefieres el correo electrónico o no posees cuenta en GitHub, puedes enviar un informe a:
* **Correo:** `dev@revoltgroup.com.ar`
* **Asunto:** `[SECURITY] Reporte de Vulnerabilidad: Revolt Pass`

---

## ⏱️ Plazos de Respuesta y Divulgación Responsable

Cumplimos con los estándares internacionales de divulgación coordinada de vulnerabilidades:
* **Confirmación Inicial:** En un plazo máximo de **48 horas** tras la recepción del reporte.
* **Triaje y Validación:** En un plazo máximo de **5 días hábiles**, confirmando la reproducción y la severidad del riesgo (CVSS v3.1).
* **Corrección y Despliegue:** Priorizamos vulnerabilidades altas y críticas con el objetivo de publicar un parche en un plazo menor a **30 días**.
* **Aviso Público de Seguridad:** Se publicará un boletín de seguridad oficial (Security Advisory) una vez desplegada la corrección, otorgando crédito al investigador (salvo solicitud expresa de anonimato).

Te solicitamos brindarnos un tiempo razonable para investigar y remediar antes de hacer público cualquier detalle técnico.

---

## 🎯 Alcance (Scope)

### Dentro del Alcance (In-Scope)
* **Criptografía del Lado del Cliente:** Fallas en el uso de primitivas WebCrypto, modo AES-256-GCM (reutilización de IV/nonce), derivación de claves PBKDF2-HMAC-SHA256 (600.000 iteraciones), envoltura de claves con WebAuthn PRF o generación de entropía.
* **Autenticación y Autorización:** Falsificación de tokens de sesión, ataques de repetición, evasión de control de accesos o escalada de privilegios en endpoints `/api/*` del Worker en Cloudflare.
* **Higiene de Memoria y Almacenamiento Local:** Fuga de secretos en texto plano en IndexedDB, `localStorage`, registros de consola, búferes de portapapeles no purgados o persistencia indebida de la Clave Maestra en memoria RAM tras bloquear la bóveda.
* **Cross-Site Scripting (XSS) e Inyecciones:** Vulnerabilidades que permitan la ejecución de código no autorizado dentro del origen autenticado de la PWA.

### Fuera del Alcance (Out-of-Scope)
* Ataques que requieran acceso físico no autorizado, privilegios de root/administrador ya comprometidos, o malware/keyloggers preexistentes en el sistema operativo del cliente.
* Ataques volumétricos de Denegación de Servicio (DoS / DDoS) contra la infraestructura de red global de Cloudflare.
* Técnicas de ingeniería social, phishing o engaño dirigidas a usuarios finales.
* Navegadores obsoletos o no compatibles que carezcan de implementación estándar de las APIs WebCrypto o WebAuthn.

---

## 🏛️ Modelo de Amenazas Zero-Knowledge

Revolt Pass está concebido bajo una arquitectura estricta de **Conocimiento Cero (Zero-Knowledge)**:
1. Todas las operaciones de cifrado y descifrado ocurren exclusivamente en el navegador/PWA del cliente.
2. El servidor (Cloudflare Worker + base de datos D1) solo almacena blobs cifrados opacos en base64 (`vault_data`), sales criptográficas aleatorias y hashes de verificación de autenticación.
3. Ni tu Contraseña Maestra ni tu Clave Maestra derivada viajan por la red ni se almacenan jamás en la base de datos.
4. En el caso hipotético de una filtración total de la base de datos del servidor, los atacantes solo obtendrán textos cifrados con AES-256-GCM computacionalmente inviables de descifrar sin tu frase de contraseña maestra.

Para conocer las formulaciones matemáticas completas, la matriz de amenazas STRIDE y los diagramas de flujo de datos, consulta la especificación técnica:
* **[03-SECURITY-AND-THREAT-MODEL.md](./docs/es/03-SECURITY-AND-THREAT-MODEL.md)** (*or [English Version](./docs/en/03-SECURITY-AND-THREAT-MODEL.md)*).
