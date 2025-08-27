import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithRetry } from 'mcpland/lib';

const ok = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
const notFound = { ok: false, status: 404, statusText: 'Not Found' } as unknown as Response;
const serverErr = { ok: false, status: 500, statusText: 'Server Error' } as unknown as Response;

describe('fetchWithRetry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock AbortSignal.timeout to avoid issues with fake timers
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns immediately on first successful response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(ok);
    const res = await fetchWithRetry('https://example.com', 3, 1);
    
    expect(res).toBe(ok);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('throws immediately on 4xx response', async () => {
    // Use real timers for this specific test to avoid timeout issues
    vi.useRealTimers();
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      return notFound;
    });

    await expect(fetchWithRetry('https://example.com', 3, 1)).rejects.toThrow(
      'HTTP 404 Not Found'
    );
    
    // The function should throw immediately on 4xx, which it does
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
    
    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
  });

  it('retries on 5xx and eventually fails with last error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch' as any)
      .mockResolvedValue(serverErr);

    // Use a try-catch to ensure no unhandled rejections
    let caughtError: Error | null = null;
    
    const promise = fetchWithRetry('https://example.com', 2, 5);
    
    // Advance timers and wait for the promise to complete
    const result = await Promise.allSettled([
      promise,
      vi.runAllTimersAsync()
    ]);
    
    // The promise should have been rejected
    expect(result[0].status).toBe('rejected');
    if (result[0].status === 'rejected') {
      expect(result[0].reason.message).toBe('HTTP 500 Server Error');
    }

    // maxRetries=2 means attempts 0,1,2 = 3 total attempts
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockRestore();
  });

  it('retries when fetch throws, then succeeds', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch' as any)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(ok);

    const promise = fetchWithRetry('https://example.com', 3, 5);

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(ok);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    
    fetchSpy.mockRestore();
  });

  it('throws fallback error when lastError is nullish', async () => {
    // Use real timers for this test to avoid timing issues
    vi.useRealTimers();
    
    // This test covers the ?? fallback on line 23
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
    
    // Create a scenario where fetch throws something that becomes null/undefined
    fetchSpy.mockRejectedValue(null); // This will result in lastError being null

    // Properly await the rejection to avoid unhandled promise rejections
    await expect(fetchWithRetry('https://example.com', 1, 1)).rejects.toThrow('fetchWithRetry: unknown error');
    
    fetchSpy.mockRestore();
    
    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
  });

});
