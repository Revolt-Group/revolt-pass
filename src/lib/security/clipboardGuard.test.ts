// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  copyToClipboardSecurely,
  cancelClipboardClear,
  isClipboardClearScheduled,
} from './clipboardGuard';

describe('clipboardGuard', () => {
  let clipboardContent = '';

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardContent = '';

    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockImplementation(async (text: string) => {
          clipboardContent = text;
          return Promise.resolve();
        }),
        readText: vi.fn().mockImplementation(async () => {
          return Promise.resolve(clipboardContent);
        }),
      },
    });
  });

  afterEach(() => {
    cancelClipboardClear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('copies text and sets a scheduled clear timer', async () => {
    const success = await copyToClipboardSecurely('123456', 45000);
    expect(success).toBe(true);
    expect(clipboardContent).toBe('123456');
    expect(isClipboardClearScheduled()).toBe(true);
  });

  it('purges clipboard after 45 seconds if content matches', async () => {
    await copyToClipboardSecurely('987654', 45000);
    expect(clipboardContent).toBe('987654');

    // Fast forward 44 seconds
    vi.advanceTimersByTime(44000);
    expect(clipboardContent).toBe('987654');

    // Fast forward 2 seconds (total 46s)
    await vi.advanceTimersByTimeAsync(2000);
    expect(clipboardContent).toBe('');
    expect(isClipboardClearScheduled()).toBe(false);
  });

  it('does NOT purge clipboard if user copied something else in between', async () => {
    await copyToClipboardSecurely('SECRET_OTP', 45000);
    expect(clipboardContent).toBe('SECRET_OTP');

    // User copies something else externally
    clipboardContent = 'MY_SHOPPING_LIST';

    // Fast forward past 45s
    await vi.advanceTimersByTimeAsync(46000);

    // Clipboard must NOT be wiped
    expect(clipboardContent).toBe('MY_SHOPPING_LIST');
  });

  it('allows canceling clear timer explicitly', async () => {
    await copyToClipboardSecurely('KEEP_ME', 45000);
    expect(isClipboardClearScheduled()).toBe(true);

    cancelClipboardClear();
    expect(isClipboardClearScheduled()).toBe(false);

    await vi.advanceTimersByTimeAsync(50000);
    expect(clipboardContent).toBe('KEEP_ME');
  });
});
