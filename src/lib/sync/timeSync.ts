/**
 * Time Drift Compensation Module.
 * Queries GET /api/time measuring Round-Trip Time (RTT) and
 * computes exact discrepancy against Cloudflare edge server with NTP robustness filters.
 */

let currentTimeDriftOffsetMs = 0;

/**
 * Returns current computed time drift offset in milliseconds.
 */
export function getTimeDriftOffsetMs(): number {
  return currentTimeDriftOffsetMs;
}

/**
 * Manually sets time drift offset in milliseconds (useful for unit tests).
 */
export function setTimeDriftOffsetMs(offsetMs: number): void {
  currentTimeDriftOffsetMs = offsetMs;
}

/**
 * Returns current timestamp in milliseconds calibrated against server clock.
 */
export function getCalibratedNow(): number {
  return Date.now() + currentTimeDriftOffsetMs;
}

/**
 * Queries /api/time endpoint to calibrate local clock against UTC server clock.
 * 
 * Mathematical formula (simplified NTP / SNTP filter):
 * RTT = t_end - t_start
 * offset = t_server - (t_start + RTT / 2)
 * 
 * Robustness criteria and safeguards:
 * 1. Strict 3-second timeout to prevent application hanging on slow networks.
 * 2. Discard samples with RTT > 3000 ms to avoid network asymmetry errors.
 * 3. Canonical server epoch range validation (between 2024 and 2049).
 * 4. 1000 ms deadband: if offset is under 1 second, local clock is assumed
 *    to be in perfect sync (GPS/NTP) to avoid injecting network jitter (offset = 0).
 * 5. 24-hour sanity ceiling: discards extreme anomalies.
 * 
 * @param baseUrl API base URL (default: empty string for relative path)
 * @returns Computed offset in milliseconds
 */
export async function syncTimeWithServer(baseUrl = ''): Promise<number> {
  const t0 = Date.now();

  try {
    const url = `${baseUrl}/api/time`;
    
    // Strict 3000 ms timeout to avoid blocking slow connections
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
      throw new Error(`Time sync error: HTTP ${response.status}`);
    }

    const t1 = Date.now();
    const rtt = t1 - t0;

    // If network latency exceeds 3 seconds, network asymmetry invalidates sample precision
    if (rtt > 3000) {
      console.warn(`TimeSync discarded due to high network latency (RTT: ${rtt}ms)`);
      return currentTimeDriftOffsetMs;
    }

    const body = (await response.json()) as {
      success: boolean;
      data?: { server_time_utc: number };
    };

    if (body.success && body.data && typeof body.data.server_time_utc === 'number') {
      const serverTimeUtc = body.data.server_time_utc;

      // Server timestamp sanity check (between 2024 and 2049)
      const MIN_EPOCH = 1704067200000; // 2024-01-01
      const MAX_EPOCH = 2500000000000; // ~2049
      if (serverTimeUtc < MIN_EPOCH || serverTimeUtc > MAX_EPOCH) {
        console.warn(`Server timestamp out of reasonable range: ${serverTimeUtc}`);
        return currentTimeDriftOffsetMs;
      }

      // Estimate exact instant when server emitted response
      const estimatedLocalServerTime = t0 + Math.floor(rtt / 2);
      const rawOffset = serverTimeUtc - estimatedLocalServerTime;

      // Safety ceiling: offsets greater than 24 hours are treated as anomalies
      const MAX_OFFSET_MS = 24 * 60 * 60 * 1000;
      if (Math.abs(rawOffset) > MAX_OFFSET_MS) {
        console.warn(`Anomalous time drift (> 24h) ignored: ${rawOffset}ms`);
        return currentTimeDriftOffsetMs;
      }

      // 1000 ms deadband: if drift is under 1 second, local clock is already
      // synchronized with UTC. Preserving offset = 0 prevents jitter jumps.
      if (Math.abs(rawOffset) < 1000) {
        currentTimeDriftOffsetMs = 0;
      } else {
        currentTimeDriftOffsetMs = rawOffset;
      }

      return currentTimeDriftOffsetMs;
    } else {
      throw new Error('Invalid time response payload');
    }
  } catch (err) {
    // If connection fails, retain current state without interrupting experience
    console.warn('Could not synchronize time drift with server:', err);
    return currentTimeDriftOffsetMs;
  }
}
