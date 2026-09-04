/**
 * Módulo de Compensación de Desfase Horario (Time Drift Compensation).
 * Consulta el endpoint GET /api/time midiendo el Round-Trip Time (RTT) y
 * calcula la discrepancia exacta con el servidor de Cloudflare.
 */

let currentTimeDriftOffsetMs = 0;

/**
 * Devuelve el desfase actual calculado en milisegundos.
 */
export function getTimeDriftOffsetMs(): number {
  return currentTimeDriftOffsetMs;
}

/**
 * Asigna manualmente el desfase en milisegundos (útil para pruebas unitarias).
 */
export function setTimeDriftOffsetMs(offsetMs: number): void {
  currentTimeDriftOffsetMs = offsetMs;
}

/**
 * Devuelve la marca de tiempo actual en milisegundos compensada con el reloj del servidor.
 */
export function getCalibratedNow(): number {
  return Date.now() + currentTimeDriftOffsetMs;
}

/**
 * Consulta el endpoint /api/time para calibrar el reloj local respecto al servidor UTC.
 * 
 * Fórmula matemática:
 * RTT = t_fin - t_inicio
 * offset = t_servidor - (t_inicio + RTT / 2)
 * 
 * @param baseUrl URL base de la API (default: cadena vacía para ruta relativa)
 * @returns Desfase calculado en milisegundos
 */
export async function syncTimeWithServer(baseUrl = ''): Promise<number> {
  const t0 = Date.now();

  try {
    const url = `${baseUrl}/api/time`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error en sincronización de tiempo: HTTP ${response.status}`);
    }

    const t1 = Date.now();
    const rtt = t1 - t0;

    const body = (await response.json()) as {
      success: boolean;
      data?: { server_time_utc: number };
    };

    if (body.success && body.data && typeof body.data.server_time_utc === 'number') {
      const serverTimeUtc = body.data.server_time_utc;
      // Estimar el momento exacto en que el servidor emitió la respuesta
      const estimatedLocalServerTime = t0 + Math.floor(rtt / 2);
      currentTimeDriftOffsetMs = serverTimeUtc - estimatedLocalServerTime;
      return currentTimeDriftOffsetMs;
    } else {
      throw new Error('Formato de respuesta de tiempo inválido');
    }
  } catch (err) {
    // Si la conexión falla, se conserva el último offset conocido sin romper la app
    console.warn('No se pudo sincronizar la deriva horaria con el servidor:', err);
    return currentTimeDriftOffsetMs;
  }
}
