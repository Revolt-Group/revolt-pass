/**
 * Revolt Pass - Zero-Knowledge Emergency Kit Generator
 * 
 * Generates an offline, high-contrast, printable emergency document (A4 / Letter).
 * 100% Client-Side. The Master Password is NEVER pre-filled or serialized;
 * the document designates a physical handwritten area for maximum Zero-Knowledge custody.
 */

import { generateQrSvgString } from './qrRenderer.ts';

export interface EmergencyKitParams {
  userId: string;
  username: string;
  instanceUrl?: string;
  vaultVersion?: number;
  kdfAlgorithm?: string;
  createdAt?: number;
}

export function generateEmergencyKitHtml(params: EmergencyKitParams): string {
  const instanceUrl = params.instanceUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://pass.revoltgroup.com.ar');
  const qrSvg = generateQrSvgString(instanceUrl, { size: 140, margin: 2 });
  const formattedDate = new Date(params.createdAt || Date.now()).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Revolt Pass — Kit de Emergencia</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      padding: 24px;
      font-size: 13px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #111827;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #000000;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge-zk {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      background: #111827;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
    }
    .doc-meta {
      text-align: right;
      font-size: 11px;
      color: #4b5563;
    }
    .alert-banner {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-left: 4px solid #111827;
      padding: 12px 16px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 12px;
      color: #1f2937;
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1fr 140px;
      gap: 20px;
      align-items: center;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .field-group {
      margin-bottom: 10px;
    }
    .field-group:last-child {
      margin-bottom: 0;
    }
    .field-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 2px;
    }
    .field-value {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      word-break: break-all;
    }
    .qr-container {
      text-align: center;
    }
    .qr-container svg {
      margin: 0 auto;
      border: 1px solid #d1d5db;
    }
    .qr-label {
      font-size: 9px;
      color: #6b7280;
      margin-top: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .master-password-box {
      border: 2px dashed #4b5563;
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 20px;
      background: #ffffff;
    }
    .master-password-title {
      font-size: 13px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .master-password-hint {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 12px;
    }
    .writing-lines {
      height: 60px;
      border-bottom: 1px solid #9ca3af;
      margin-top: 8px;
    }
    .steps-section {
      border-top: 1px solid #e5e7eb;
      padding-top: 16px;
      margin-bottom: 20px;
    }
    .steps-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #111827;
      margin-bottom: 10px;
    }
    .steps-list {
      list-style-type: none;
      counter-reset: steps-counter;
      font-size: 12px;
    }
    .steps-list li {
      counter-increment: steps-counter;
      margin-bottom: 8px;
      position: relative;
      padding-left: 24px;
      color: #374151;
    }
    .steps-list li::before {
      content: counter(steps-counter);
      position: absolute;
      left: 0;
      top: 0;
      width: 16px;
      height: 16px;
      background: #111827;
      color: #ffffff;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      line-height: 16px;
    }
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">🛡️ REVOLT PASS</div>
      <div class="badge-zk">Kit de Emergencia & Recuperación Zero-Knowledge</div>
    </div>
    <div class="doc-meta">
      <div><strong>Emisión:</strong> ${formattedDate}</div>
      <div><strong>Versión Bóveda:</strong> v${params.vaultVersion || 1}</div>
      <div><strong>Cifrado:</strong> AES-256-GCM · ${params.kdfAlgorithm === 'argon2id' ? 'Argon2id 64MB' : 'PBKDF2 600K'}</div>
    </div>
  </div>

  <div class="alert-banner">
    <strong>INSTRUCCIÓN CRÍTICA DE SEGURIDAD ZERO-KNOWLEDGE:</strong><br/>
    Revolt Pass opera bajo estricto modelo Zero-Knowledge: <strong>tu Contraseña Maestra jamás viaja ni se almacena en el servidor</strong>. Si olvidas tu clave y pierdes tus dispositivos autenticados, tus datos serán criptográficamente irrecuperables. Este documento físico es tu único salvavidas. Guárdalo en una caja fuerte o custodia física segura.
  </div>

  <div class="grid-info">
    <div>
      <div class="field-group">
        <div class="field-label">Dominio / URL de la Instancia</div>
        <div class="field-value">${instanceUrl}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Nombre de Usuario</div>
        <div class="field-value">${params.username}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Identificador de Usuario (User ID)</div>
        <div class="field-value" style="font-size: 11px;">${params.userId}</div>
      </div>
    </div>
    <div class="qr-container">
      ${qrSvg}
      <div class="qr-label">Acceso Directo</div>
    </div>
  </div>

  <div class="master-password-box">
    <div class="master-password-title">
      <span>CONTRASEÑA MAESTRA</span>
      <span style="font-size: 10px; color: #dc2626; font-weight: 700;">ANOTAR EXCLUSIVAMENTE A MANO</span>
    </div>
    <div class="master-password-hint">
      Por seguridad criptográfica, este campo no ha sido rellenado automáticamente. Escribe tu contraseña maestra con tinta indeleble a continuación:
    </div>
    <div class="writing-lines"></div>
  </div>

  <div class="steps-section">
    <div class="steps-title">Protocolo de Restauración de Emergencia</div>
    <ol class="steps-list">
      <li>Escanea el código QR de este documento o abre un navegador moderno e ingresa a la URL de tu instancia.</li>
      <li>En la pantalla de inicio de sesión, introduce tu <strong>Nombre de Usuario</strong> y la <strong>Contraseña Maestra</strong> anotada en este papel.</li>
      <li>El navegador descargará el contenedor cifrado desde Cloudflare D1 y re-derivará tus claves criptográficas localmente mediante WebCrypto / WebAssembly.</li>
      <li>Una vez desbloqueada la bóveda, dirígete a <em>Seguridad & Sesiones</em> para vincular nuevas llaves biométricas (Windows Hello / Touch ID / FIDO2) y revocar sesiones de dispositivos perdidos.</li>
    </ol>
  </div>

  <div class="footer">
    <span>Revolt Group · Revolt Pass Open Source (AGPLv3)</span>
    <span>DOCUMENTO FÍSICO PRIVADO Y CONFIDENCIAL · DESTRUIR TRAS REVOCACIÓN</span>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.print();
      }, 400);
    });
  </script>
</body>
</html>`;
}

/**
 * Triggers printing of the Emergency Kit in an isolated popup window or iframe.
 */
export function printEmergencyKit(params: EmergencyKitParams): void {
  const html = generateEmergencyKitHtml(params);
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    // Fallback if popup blocker is active: use an invisible iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
    }
  }
}