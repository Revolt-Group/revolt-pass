/**
 * Secure Clipboard Guard Module
 *
 * Copies secrets (TOTP tokens, passwords, recovery codes) to system clipboard
 * and schedules an automatic wipe after exactly 45 seconds.
 * Prior to wiping, verifies via navigator.clipboard.readText() whether the current
 * clipboard content still matches the copied secret. If the user copied another item
 * in the meantime, the new content is preserved and not overwritten.
 */

let activeClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopiedSecret: string | null = null;

/**
 * Securely copies text to clipboard and schedules purge in timeoutMs (default: 45s).
 *
 * @param text Secret to copy to clipboard.
 * @param timeoutMs Timeout in milliseconds before clearing (default: 45,000 ms).
 * @returns Promise<boolean> resolving to true if copy succeeded.
 */
export async function copyToClipboardSecurely(
  text: string,
  timeoutMs = 45000
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    lastCopiedSecret = text;

    // If a previous clear was scheduled, cancel and reschedule for this secret
    cancelClipboardClear();

    activeClearTimer = setTimeout(async () => {
      await performGuardedClear(text);
    }, timeoutMs);

    return true;
  } catch (err: unknown) {
    console.warn('Error copying to clipboard securely:', err);
    return false;
  }
}

/**
 * Performs guarded purge verifying clipboard still contains original copied text.
 */
async function performGuardedClear(expectedText: string): Promise<void> {
  activeClearTimer = null;

  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return;
  }

  try {
    const currentClipboard = await navigator.clipboard.readText();
    // Purge only if current clipboard content is still exactly the copied secret
    if (currentClipboard === expectedText) {
      await navigator.clipboard.writeText('');
      if (lastCopiedSecret === expectedText) {
        lastCopiedSecret = null;
      }
    }
  } catch {
    // If read permissions were revoked or fail, attempt defensive clear
    // if last copied secret matches
    if (lastCopiedSecret === expectedText && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // Silent fallback
      }
      lastCopiedSecret = null;
    }
  }
}

/**
 * Cancels any scheduled clipboard purge.
 */
export function cancelClipboardClear(): void {
  if (activeClearTimer) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
}

/**
 * Checks whether a clipboard purge is currently scheduled.
 */
export function isClipboardClearScheduled(): boolean {
  return activeClearTimer !== null;
}
