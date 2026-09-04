/**
 * Módulo de Limpieza Segura de Portapapeles (Clipboard Guard)
 *
 * Copia secretos (tokens TOTP, contraseñas, recovery codes) al portapapeles del sistema
 * y programa una purga automática exactamente a los 45 segundos.
 * Antes de limpiar, verifica mediante navigator.clipboard.readText() si el contenido
 * actual sigue siendo el secreto copiado. Si el usuario copió otro elemento en el intermedio,
 * se respeta el nuevo contenido y no se sobrescribe.
 */

let activeClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopiedSecret: string | null = null;

/**
 * Copia un texto al portapapeles de manera segura y agenda su purga en timeoutMs (por defecto 45s).
 *
 * @param text Secreto a copiar en el portapapeles.
 * @param timeoutMs Tiempo en milisegundos antes del borrado (default: 45,000 ms).
 * @returns Promise<boolean> que resuelve a true si el copiado fue exitoso.
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

    // Si había una purga previa programada, cancelarla y reprogramar para este secreto
    cancelClipboardClear();

    activeClearTimer = setTimeout(async () => {
      await performGuardedClear(text);
    }, timeoutMs);

    return true;
  } catch (err: unknown) {
    console.warn('Error al copiar al portapapeles de forma segura:', err);
    return false;
  }
}

/**
 * Realiza la purga verificando que el portapapeles aún contenga el texto copiado originalmente.
 */
async function performGuardedClear(expectedText: string): Promise<void> {
  activeClearTimer = null;

  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return;
  }

  try {
    const currentClipboard = await navigator.clipboard.readText();
    // Purgar únicamente si el contenido actual sigue siendo exactamente el secreto copiado
    if (currentClipboard === expectedText) {
      await navigator.clipboard.writeText('');
      if (lastCopiedSecret === expectedText) {
        lastCopiedSecret = null;
      }
    }
  } catch {
    // Si los permisos de lectura fueron revocados o fallan, intentar limpiar como medida defensiva
    // si el último secreto registrado coincide
    if (lastCopiedSecret === expectedText && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // Silencioso
      }
      lastCopiedSecret = null;
    }
  }
}

/**
 * Cancela cualquier purga de portapapeles que esté programada.
 */
export function cancelClipboardClear(): void {
  if (activeClearTimer) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
}

/**
 * Comprueba si hay un temporizador de purga activo.
 */
export function isClipboardClearScheduled(): boolean {
  return activeClearTimer !== null;
}
