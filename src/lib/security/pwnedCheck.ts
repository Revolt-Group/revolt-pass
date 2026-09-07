/**
 * HaveIBeenPwned k-Anonymity Leak Checker Module
 *
 * Verifies if a password or credential secret has appeared in known public data breaches
 * using the k-Anonymity model without revealing the password or its full hash.
 *
 * Mathematical Privacy Invariant:
 * Only the first 5 hexadecimal characters of the SHA-1 hash are queried against the edge proxy.
 * There are 16^35 (~10^42) possible combinations for the remaining suffix, ensuring absolute
 * mathematical one-way anonymity while discovering exact match counts locally in the client.
 */

export interface PwnedCheckResult {
  compromised: boolean;
  count: number;
  hashPrefix: string;
}

/**
 * Computes the uppercase SHA-1 hexadecimal string of an arbitrary input text.
 */
export async function computeSha1Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Checks whether a given secret (password, string, or code) appears in HaveIBeenPwned breaches.
 *
 * @param secret The plaintext string to inspect.
 * @param fetchFn Optional custom fetch for unit testing or proxying.
 */
export async function checkPasswordPwned(
  secret: string,
  fetchFn: typeof fetch = fetch
): Promise<PwnedCheckResult> {
  if (!secret || secret.trim().length === 0) {
    return { compromised: false, count: 0, hashPrefix: '' };
  }

  const sha1Hex = await computeSha1Hex(secret);
  const prefix = sha1Hex.slice(0, 5);
  const suffix = sha1Hex.slice(5);

  const response = await fetchFn(`/api/pwned-check?prefix=${prefix}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Error al verificar filtraciones (HTTP ${response.status})`);
  }

  const json = (await response.json()) as {
    success: boolean;
    data?: { range: string };
  };

  const rangeText = json?.data?.range || '';
  const lines = rangeText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [lineSuffix, countStr] = trimmed.split(':');
    if (lineSuffix && lineSuffix.toUpperCase() === suffix) {
      const count = parseInt(countStr || '0', 10);
      return {
        compromised: count > 0,
        count: isNaN(count) ? 1 : count,
        hashPrefix: prefix,
      };
    }
  }

  return {
    compromised: false,
    count: 0,
    hashPrefix: prefix,
  };
}
