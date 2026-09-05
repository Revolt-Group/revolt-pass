/**
 * Vault Auto-Lock Manager (Inactivity & Tab Visibility Changes)
 *
 * Listens to user activity events and document visibility changes.
 * If 5 minutes of inactivity elapse or tab remains hidden for over 30 seconds,
 * the lock callback executes to purge cryptographic keys from RAM.
 */

export interface AutoLockOptions {
  /** Inactivity timeout in milliseconds before locking (default: 5 minutes = 300,000 ms) */
  inactivityTimeoutMs?: number;
  /** Grace period in milliseconds when tab is hidden before locking (default: 30 seconds = 30,000 ms) */
  backgroundGraceMs?: number;
  /** If true, immediately locks when tab is hidden without grace period */
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
    const rawTimeout = options.inactivityTimeoutMs ?? 5 * 60 * 1000;
    this.inactivityTimeoutMs = rawTimeout > 0 ? rawTimeout : 5 * 60 * 1000;

    const rawGrace = options.backgroundGraceMs ?? 30 * 1000;
    this.backgroundGraceMs = rawGrace > 0 ? rawGrace : 30 * 1000;

    this.immediateLockOnHide = options.immediateLockOnHide ?? false;

    this.boundActivityHandler = this.handleUserActivity.bind(this);
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);
  }

  /**
   * Starts inactivity and visibility monitoring.
   * @param onLock Callback executed when app locks and purges RAM.
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
        'mouseup',
        'keydown',
        'touchstart',
        'touchend',
        'touchmove',
        'scroll',
        'wheel',
        'pointerdown',
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
   * Stops monitoring and clears all timers and listeners.
   */
  public stop(): void {
    this.isRunning = false;
    this.clearTimers();

    if (typeof window !== 'undefined') {
      const activityEvents = [
        'mousemove',
        'mousedown',
        'mouseup',
        'keydown',
        'touchstart',
        'touchend',
        'touchmove',
        'scroll',
        'wheel',
        'pointerdown',
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
   * Forces immediate session lock.
   */
  public triggerLock(): void {
    this.clearTimers();
    if (this.onLockCallback) {
      this.onLockCallback();
    }
  }

  /**
   * Physical user interaction event handler.
   */
  private handleUserActivity(): void {
    if (!this.isRunning) return;
    this.resetInactivityTimer();
  }

  /**
   * Tab visibility change handler.
   */
  private handleVisibilityChange(): void {
    if (!this.isRunning || typeof document === 'undefined') return;

    if (document.hidden) {
      if (this.immediateLockOnHide) {
        this.triggerLock();
      } else {
        // Start background grace timer
        if (this.backgroundTimer) clearTimeout(this.backgroundTimer);
        this.backgroundTimer = setTimeout(() => {
          if (document.hidden) {
            this.triggerLock();
          }
        }, this.backgroundGraceMs);
      }
    } else {
      // User returned to tab: cancel grace timer
      if (this.backgroundTimer) {
        clearTimeout(this.backgroundTimer);
        this.backgroundTimer = null;
      }
      this.resetInactivityTimer();
    }
  }

  /**
   * Resets main inactivity timer.
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
   * Cancels all active timers.
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
