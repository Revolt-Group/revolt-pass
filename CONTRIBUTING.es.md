# Contribuir a Revolt Pass

¡Antes que nada, muchas gracias por tu interés en colaborar con **Revolt Pass**! 🎉

Revolt Pass es una bóveda de seguridad y autenticación 2FA de código abierto (*open source*), soberana y con arquitectura Zero-Knowledge, construida sobre Cloudflare Workers, Cloudflare D1 y React moderno con Web Crypto nativo. Damos la bienvenida a contribuciones de desarrolladores, investigadores de seguridad, diseñadores y defensores de la privacidad.

*Lee este documento en otros idiomas: [English](./CONTRIBUTING.md)*

---

## 🏛️ Principios Criptográficos Rectores

Antes de escribir código, por favor revisa nuestras reglas de arquitectura fundamentales:

1. **Zero-Knowledge Estricto:** El servidor **nunca** debe recibir secretos en texto plano, contraseñas maestras o claves de cifrado. Únicamente persiste blobs binarios cifrados (`AES-GCM-256`) y metadatos de sincronización.
2. **Exclusividad de Web Crypto Nativo:** Nunca instales librerías criptográficas de terceros en espacio de usuario JavaScript (ej. `crypto-js`, `forge`). Todas las primitivas criptográficas deben delegarse a `window.crypto.subtle` o WebAssembly nativo cuando esté estrictamente justificado.
3. **Higiene de Memoria:** Las cadenas o buffers sensibles en memoria RAM deben desreferenciarse, limpiarse o purgarse automáticamente en el evento de auto-lock.
4. **Resiliencia Offline-First:** Toda funcionalidad de la interfaz debe funcionar de manera completa sin conexión a internet mediante persistencia local en IndexedDB.

---

## 🛠️ Comenzando

### Requisitos Previos
* **Node.js:** `>= 20.0.0`
* **Gestor de Paquetes:** `pnpm` (obligatorio — no utilices `npm` ni `yarn`)
* **CLI de Cloudflare:** `wrangler` (incluido en las dependencias de desarrollo)

### Configuración Local
1. Haz un fork y clona el repositorio:
   ```bash
   git clone https://github.com/Revolt-Group/revolt-pass.git
   cd revolt-pass
   ```
2. Instala las dependencias:
   ```bash
   pnpm install
   ```
3. Prepara la configuración local de Wrangler:
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```
4. Inicia el servidor de desarrollo frontend:
   ```bash
   pnpm dev
   ```
5. Ejecuta la suite de pruebas automatizadas:
   ```bash
   pnpm test
   ```
6. Compila y verifica los tipos para producción:
   ```bash
   pnpm build
   ```

---

## 🧪 Pautas de Pruebas (Testing)

Mantenemos una alta cobertura de pruebas para las primitivas criptográficas y la lógica de sincronización:
* Las pruebas unitarias y de integración se ejecutan mediante **Vitest**.
* Los archivos de prueba residen junto al código fuente (ej. `*.test.ts`).
* Antes de enviar un Pull Request, asegúrate de que todas las pruebas pasen con éxito:
  ```bash
  pnpm test
  pnpm build
  ```

---

## 📝 Convención de Mensajes de Commit

Seguimos el estándar de [Conventional Commits](https://www.conventionalcommits.org/):

* `feat(alcance):` Una nueva funcionalidad (ej. `feat(vault): add folder grouping`)
* `fix(alcance):` Corrección de un error (ej. `fix(totp): correct time drift calculation`)
* `docs(alcance):` Cambios en la documentación (ej. `docs: update deployment guide`)
* `refactor(alcance):` Cambios en el código que no corrigen errores ni añaden funcionalidades
* `test(alcance):` Añadir o modificar pruebas
* `perf(alcance):` Mejoras de rendimiento

---

## 🔀 Proceso de Pull Request (PR)

1. Crea una rama descriptiva a partir de `main`:
   ```bash
   git checkout -b feat/mi-nueva-funcionalidad
   ```
2. Realiza tus modificaciones respetando el modo estricto de TypeScript y las convenciones de Tailwind CSS.
3. Asegúrate de que no se incluyan credenciales personales, claves de API o IDs de bases de datos.
4. Sube tu rama y abre un Pull Request hacia `main`.
5. Describe detalladamente tus cambios en la descripción del PR, enlazando los issues correspondientes.

---

## 🔒 Reporte Responsable de Vulnerabilidades de Seguridad

Si descubres una posible vulnerabilidad de seguridad en Revolt Pass, **por favor NO abras un Issue público en GitHub**.

En su lugar, envía un reporte confidencial de divulgación responsable directamente a los mantenedores en **dev@revoltgroup.com.ar** o abre un [GitHub Private Vulnerability Report](https://github.com/Revolt-Group/revolt-pass/security/advisories/new).
