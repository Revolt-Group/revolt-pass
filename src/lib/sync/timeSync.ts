/**
 * Módulo de Compensación de Desfase Horario (Time Drift Compensation).
 * Consulta el endpoint GET /api/time midiendo el Round-Trip Time (RTT) y
 * calcula la discrepancia exacta con el servidor de Cloudflare con filtros de robustez NTP.
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
 * Fórmula matemática (filtro NTP / SNTP simplificado):
 * RTT = t_fin - t_inicio
 * offset = t_servidor - (t_inicio + RTT / 2)
 * 
 * Criterios de robustez y salvaguardas:
 * 1. Timeout estricto de 3 segundos para no congelar la app ante caídas de red.
 * 2. Descarte de muestras con RTT > 3000 ms para evitar errores por asimetría de red.
 * 3. Validación de rango temporal canónico del servidor (entre 2024 y 2049).
 * 4. Banda muerta (Deadband) de 1000 ms: si el desfase es menor a 1 segundo,
 *    se asume que el reloj del dispositivo está en perfecta sincronía nativa (GPS/NTP)
 *    y se evita inyectar jitter de red (offset = 0).
 * 5. Límite máximo de seguridad de 24 horas: descarta anomalías extremas.
 * 
 * @param baseUrl URL base de la API (default: cadena vacía para ruta relativa)
 * @returns Desfase calculado en milisegundos
 */
export async function syncTimeWithServer(baseUrl = ''): Promise<number> {
  const t0 = Date.now();

  try {
    const url = `${baseUrl}/api/time`;
    
    // Timeout estricto de 3000 ms para no bloquear conexiones lentas
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller?.signal,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Error en sincronización de tiempo: HTTP ${response.status}`);
    }

    const t1 = Date.now();
    const rtt = t1 - t0;

    // Si la latencia de red supera 3 segundos, la asimetría de red invalida la precisión de la muestra
    if (rtt > 3000) {
      console.warn(`TimeSync descartado por alta latencia de red (RTT: ${rtt}ms)`);
      return currentTimeDriftOffsetMs;
    }

    const body = (await response.json()) as {
      success: boolean;
      data?: { server_time_utc: number };
    };

    if (body.success && body.data && typeof body.data.server_time_utc === 'number') {
      const serverTimeUtc = body.data.server_time_utc;

      // Validación de cordura del timestamp del servidor (entre 2024 y 2049)
      const MIN_EPOCH = 1704067200000; // 2024-01-01
      const MAX_EPOCH = 2500000000000; // ~2049
      if (serverTimeUtc < MIN_EPOCH || serverTimeUtc > MAX_EPOCH) {
        console.warn(`Timestamp de servidor fuera de rango razonable: ${serverTimeUtc}`);
        return currentTimeDriftOffsetMs;
      }

      // Estimar el momento exacto en que el servidor emitió la respuesta
      const estimatedLocalServerTime = t0 + Math.floor(rtt / 2);
      const rawOffset = serverTimeUtc - estimatedLocalServerTime;

      // Límite de seguridad: desfases mayores a 24 horas se consideran anomalías
      const MAX_OFFSET_MS = 24 * 60 * 60 * 1000;
      if (Math.abs(rawOffset) > MAX_OFFSET_MS) {
        console.warn(`Desfase horario anómalo (> 24h) ignorado: ${rawOffset}ms`);
        return currentTimeDriftOffsetMs;
      }

      // Banda muerta de 1000 ms: si el desfase es menor a 1 segundo, el reloj local
      // del teléfono/PC ya está perfectamente sincronizado con el estándar UTC.
      // Mantener offset = 0 evita saltos por jitter de conexión.
      if (Math.abs(rawOffset) < 1000) {
        currentTimeDriftOffsetMs = 0;
      } else {
        currentTimeDriftOffsetMs = rawOffset;
      }

      return currentTimeDriftOffsetMs;
    } else {
      throw new Error('Formato de respuesta de tiempo inválido');
    }
  } catch (err) {
    // Si la conexión falla, se conserva el estado actual sin interrumpir la experiencia
    console.warn('No se pudo sincronizar la deriva horaria con el servidor:', err);
    return currentTimeDriftOffsetMs;
  }
}
