// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoLockManager } from './autoLock';

describe('AutoLockManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('triggers onLock callback after 5 minutes of inactivity by default', () => {
    const onLock = vi.fn();
    const manager = new AutoLockManager({ inactivityTimeoutMs: 300000 });

    manager.start(onLock);
    expect(onLock).not.toHaveBeenCalled();

    // Advance time by 4 minutes 59 seconds
    vi.advanceTimersByTime(299000);
    expect(onLock).not.toHaveBeenCalled();

    // Advance time by 2 seconds (total 5m 1s)
    vi.advanceTimersByTime(2000);
    expect(onLock).toHaveBeenCalledTimes(1);

    manager.stop();
  });

  it('resets inactivity timer on user activity event', () => {
    const onLock = vi.fn();
    const manager = new AutoLockManager({ inactivityTimeoutMs: 10000 });

    manager.start(onLock);

    // Advance time by 8s (inactivity threshold is 10s)
    vi.advanceTimersByTime(8000);
    expect(onLock).not.toHaveBeenCalled();

    // Simulate user activity
    window.dispatchEvent(new Event('mousemove'));

    // Advance another 8s (16s total, but only 8s since last activity)
    vi.advanceTimersByTime(8000);
    expect(onLock).not.toHaveBeenCalled();

    // Advance another 3s (11s since last activity)
    vi.advanceTimersByTime(3000);
    expect(onLock).toHaveBeenCalledTimes(1);

    manager.stop();
  });

  it('triggers lock when tab is hidden beyond grace period', () => {
    const onLock = vi.fn();
    const manager = new AutoLockManager({
      inactivityTimeoutMs: 300000,
      backgroundGraceMs: 30000,
    });

    manager.start(onLock);

    // Mock document.hidden to true
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });

    document.dispatchEvent(new Event('visibilitychange'));

    // 25s hidden (less than 30s grace)
    vi.advanceTimersByTime(25000);
    expect(onLock).not.toHaveBeenCalled();

    // 10s more (total 35s hidden)
    vi.advanceTimersByTime(10000);
    expect(onLock).toHaveBeenCalledTimes(1);

    manager.stop();
  });

  it('cancels background grace timer if user returns before grace period expires', () => {
    const onLock = vi.fn();
    const manager = new AutoLockManager({
      inactivityTimeoutMs: 300000,
      backgroundGraceMs: 30000,
    });

    manager.start(onLock);

    // Tab hidden
    let isHidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => isHidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(20000); // 20s hidden
    expect(onLock).not.toHaveBeenCalled();

    // User comes back
    isHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(20000); // Another 20s passed, but user is active on tab
    expect(onLock).not.toHaveBeenCalled();

    manager.stop();
  });

  it('triggers immediate lock if immediateLockOnHide is enabled', () => {
    const onLock = vi.fn();
    const manager = new AutoLockManager({
      immediateLockOnHide: true,
    });

    manager.start(onLock);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onLock).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});
