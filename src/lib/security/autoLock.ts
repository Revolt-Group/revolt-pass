/**
 * Módulo de Auto-Bloqueo de Bóveda (Inactividad y Cambio de Pestaña)
 *
 * Escucha eventos de actividad del usuario y cambios de visibilidad en el documento.
 * Si transcurren 5 minutos de inactividad o la pestaña permanece oculta por más de 30 segundos,
 * se ejecuta el callback de bloqueo para purgar las claves criptográficas de la memoria RAM.
 */

export interface AutoLockOptions {
  /** Tiempo de inactividad en milisegundos antes de bloquear (por defecto: 5 minutos = 300,000 ms) */
  inactivityTimeoutMs?: number;
  /** Tiempo de gracia en milisegundos al ocultar la pestaña antes de bloquear (por defecto: 30 segundos = 30,000 ms) */
  backgroundGraceMs?: number;
  /** Si es true, bloquea inmediatamente al ocultar la pestaña sin periodo de gracia */
  immediateLockOnHide?: boolean;
}

export class AutoLockManager {
  private inactivityTimeoutMs: number;
  private backgroundGraceMs: number;
  private immediateLockOnHide: boolean;

  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;

  private onLockCallback: (() => void) | null = null;
  private isRunning = false;

  private boundActivityHandler: () => void;
  private boundVisibilityHandler: () => void;

  constructor(options: AutoLockOptions = {}) {
    this.inactivityTimeoutMs = options.inactivityTimeoutMs ?? 5 * 60 * 1000; // 5 min
    this.backgroundGraceMs = options.backgroundGraceMs ?? 30 * 1000; // 30s
    this.immediateLockOnHide = options.immediateLockOnHide ?? false;

    this.boundActivityHandler = this.handleUserActivity.bind(this);
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
  }

  /**
   * Inicia el monitoreo de inactividad y visibilidad.
   * @param onLock Callback ejecutado cuando se decide bloquear la aplicación y purgar RAM.
   */
  public start(onLock: () => void): void {
    if (this.isRunning) {
      this.stop();
    }

    this.onLockCallback = onLock;
    this.isRunning = true;

    if (typeof window !== 'undefined') {
      const activityEvents = [
        'mousemove',
        'mousedown',
        'keydown',
        'touchstart',
        'scroll',
        'wheel',
      ];

      activityEvents.forEach((evt) => {
        window.addEventListener(evt, this.boundActivityHandler, { passive: true });
      });

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.boundVisibilityHandler);
      }
    }

    this.resetInactivityTimer();
  }

  /**
   * Detiene el monitoreo y limpia todos los temporizadores y listeners.
   */
  public stop(): void {
    this.isRunning = false;
    this.clearTimers();

    if (typeof window !== 'undefined') {
      const activityEvents = [
        'mousemove',
        'mousedown',
        'keydown',
        'touchstart',
        'scroll',
        'wheel',
      ];

      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, this.boundActivityHandler);
      });

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      }
    }

    this.onLockCallback = null;
  }

  /**
   * Fuerza el bloqueo inmediato de la sesión.
   */
  public triggerLock(): void {
    this.clearTimers();
    if (this.onLockCallback) {
      this.onLockCallback();
    }
  }

  /**
   * Manejador de eventos de interacción física del usuario.
   */
  private handleUserActivity(): void {
    if (!this.isRunning) return;
    this.resetInactivityTimer();
  }

  /**
   * Manejador de cambio de visibilidad de pestaña.
   */
  private handleVisibilityChange(): void {
    if (!this.isRunning || typeof document === 'undefined') return;

    if (document.hidden) {
      if (this.immediateLockOnHide) {
        this.triggerLock();
      } else {
        // Iniciar temporizador de gracia en segundo plano
        if (this.backgroundTimer) clearTimeout(this.backgroundTimer);
        this.backgroundTimer = setTimeout(() => {
          if (document.hidden) {
            this.triggerLock();
          }
        }, this.backgroundGraceMs);
      }
    } else {
      // El usuario regresó a la pestaña: cancelar temporizador de gracia
      if (this.backgroundTimer) {
        clearTimeout(this.backgroundTimer);
        this.backgroundTimer = null;
      }
      this.resetInactivityTimer();
    }
  }

  /**
   * Reinicia el temporizador de inactividad principal.
   */
  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      this.triggerLock();
    }, this.inactivityTimeoutMs);
  }

  /**
   * Cancela todos los temporizadores activos.
   */
  private clearTimers(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }
}
