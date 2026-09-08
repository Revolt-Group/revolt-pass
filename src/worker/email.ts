/**
 * Revolt Pass - BYOK Email Alerter Module
 * 
 * Supports:
 * 1. Resend (BYOK - User enters their own free tier API key)
 * 2. Cloudflare Email (send_email binding - requires Workers Paid on user's CF account)
 * 
 * Generates branded, high-contrast dark mode HTML alerts containing zero secrets.
 */

import type { Env } from './types.ts';

export interface EmailAlertOptions {
  to: string;
  provider: 'resend' | 'cloudflare';
  resendApiKey?: string;
  resendFromEmail?: string;
  title: string;
  eventType: string;
  deviceName?: string;
  ipCountry?: string;
  timestamp?: number;
  lang?: 'es' | 'en';
}

export function buildSecurityAlertHtml(options: EmailAlertOptions): string {
  const isEn = options.lang === 'en';
  const dateStr = new Date(options.timestamp || Date.now()).toUTCString();

  const labels = isEn
    ? {
        appTitle: 'REVOLT PASS',
        subtitle: 'Zero-Knowledge Security Notification',
        badge: 'SECURITY ALERT',
        event: 'Security Event',
        device: 'Device',
        country: 'Detected Location',
        time: 'Date & Time (UTC)',
        actionTitle: 'Did not initiate this action?',
        actionText:
          'If you do not recognize this activity, access Revolt Pass immediately and select "Revoke all other sessions" in the Security panel to terminate unauthorized access.',
        ctaBtn: 'Open Revolt Pass',
        footer: 'Zero-Knowledge Architecture · No vault secrets are ever transmitted or stored on servers.',
      }
    : {
        appTitle: 'REVOLT PASS',
        subtitle: 'Notificación de Seguridad Zero-Knowledge',
        badge: 'ALERTA DE SEGURIDAD',
        event: 'Evento de Seguridad',
        device: 'Dispositivo',
        country: 'Ubicación Detectada',
        time: 'Fecha y Hora (UTC)',
        actionTitle: '¿No reconoces esta actividad?',
        actionText:
          'Si no realizaste esta acción, ingresa de inmediato a Revolt Pass y pulsa "Cerrar todas las demás sesiones" en el panel de Seguridad para revocar el acceso no autorizado.',
        ctaBtn: 'Abrir Revolt Pass',
        footer: 'Arquitectura Zero-Knowledge · Ningún secreto o dato de tu bóveda es transmitido a los servidores.',
      };

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'es'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#090d16;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding:28px 28px 16px;background:linear-gradient(135deg,rgba(16,185,129,0.12) 0%,rgba(6,182,212,0.06) 100%);border-bottom:1px solid #1e293b;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:800;letter-spacing:1px;color:#10b981;">
                      🛡️ ${labels.appTitle}
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                      ${labels.subtitle}
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#f59e0b;background-color:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:9999px;">
                      ${labels.badge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:28px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#ffffff;line-height:1.4;">
                ${options.title}
              </h2>

              <table role="presentation" width="100%" style="margin:20px 0;background-color:#090d16;border:1px solid #1e293b;border-radius:12px;padding:16px;">
                <tr>
                  <td style="padding:8px;font-size:13px;color:#94a3b8;width:35%;">${labels.event}:</td>
                  <td style="padding:8px;font-size:13px;font-weight:600;color:#38bdf8;">${options.eventType}</td>
                </tr>
                ${
                  options.deviceName
                    ? `<tr>
                  <td style="padding:8px;font-size:13px;color:#94a3b8;border-top:1px solid #1e293b;">${labels.device}:</td>
                  <td style="padding:8px;font-size:13px;font-weight:500;color:#f1f5f9;border-top:1px solid #1e293b;">${options.deviceName}</td>
                </tr>`
                    : ''
                }
                ${
                  options.ipCountry
                    ? `<tr>
                  <td style="padding:8px;font-size:13px;color:#94a3b8;border-top:1px solid #1e293b;">${labels.country}:</td>
                  <td style="padding:8px;font-size:13px;font-weight:600;color:#f59e0b;border-top:1px solid #1e293b;">🌍 ${options.ipCountry}</td>
                </tr>`
                    : ''
                }
                <tr>
                  <td style="padding:8px;font-size:13px;color:#94a3b8;border-top:1px solid #1e293b;">${labels.time}:</td>
                  <td style="padding:8px;font-size:12px;color:#cbd5e1;border-top:1px solid #1e293b;">${dateStr}</td>
                </tr>
              </table>

              <!-- Warning Box -->
              <div style="margin:24px 0;padding:16px;background-color:rgba(239,68,68,0.08);border-left:4px solid #ef4444;border-radius:8px;">
                <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:6px;">
                  ⚠️ ${labels.actionTitle}
                </div>
                <div style="font-size:12px;color:#cbd5e1;line-height:1.5;">
                  ${labels.actionText}
                </div>
              </div>

              <!-- Button -->
              <div style="text-align:center;margin:28px 0 12px;">
                <a href="https://pass.revoltgroup.com.ar" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:10px;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                  ${labels.ctaBtn} →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background-color:#090d16;border-top:1px solid #1e293b;font-size:11px;color:#64748b;text-align:center;line-height:1.5;">
              ${labels.footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends an email via user's personal Resend API key (Zero-Cost for Revolt Pass).
 */
export async function sendViaResend(
  apiKey: string,
  from: string | undefined,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const fromAddress = from && from.includes('@') ? from : 'Revolt Pass <onboarding@resend.dev>';
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Resend error (${response.status}): ${errorText}` };
    }

    const data = (await response.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error connecting to Resend';
    return { success: false, error: msg };
  }
}

/**
 * Dispatches a security email alert according to user settings.
 */
export async function dispatchEmailAlert(
  env: Env,
  options: EmailAlertOptions
): Promise<{ success: boolean; error?: string }> {
  const html = buildSecurityAlertHtml(options);

  if (options.provider === 'resend') {
    if (!options.resendApiKey) {
      return { success: false, error: 'Missing Resend API Key' };
    }
    return sendViaResend(
      options.resendApiKey,
      options.resendFromEmail,
      options.to,
      options.title,
      html
    );
  }

  if (options.provider === 'cloudflare') {
    if (!env.SEND_EMAIL) {
      return {
        success: false,
        error:
          'Cloudflare Email binding (send_email) is not available. Cloudflare requires a Workers Paid ($5/mo) subscription for outbound email.',
      };
    }

    try {
      await env.SEND_EMAIL.send({
        from: options.resendFromEmail || 'noreply@pass.revoltgroup.com.ar',
        to: options.to,
        subject: options.title,
        content: html,
      });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloudflare send_email failed';
      return { success: false, error: msg };
    }
  }

  return { success: false, error: `Unsupported email provider: ${options.provider}` };
}
