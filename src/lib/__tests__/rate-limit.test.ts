import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rateLimit,
  checkRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  getRateLimitStats,
  getClientId,
  applyRateLimit,
  RATE_LIMITS,
} from '../rate-limit';

// In-memory storage for testing
const testBuckets = new Map<string, { count: number; window_start: number; window_ms: number }>();

// Mock the database module
vi.mock('@/lib/db/async-db', () => {
  const mockDb = {
    prepare: (sql: string) => ({
      get: async (...params: unknown[]) => {
        // Handle the new atomic UPSERT with RETURNING for rateLimit
        if (sql.includes('INSERT INTO rate_limit_buckets') && sql.includes('RETURNING')) {
          const key = params[0] as string;
          const now = params[1] as number;
          const windowMs = params[2] as number;
          // params[3], [4], [5], [6] are for the UPDATE CASE conditions

          const existing = testBuckets.get(key);
          if (!existing) {
            // New bucket - count=1
            testBuckets.set(key, { count: 1, window_start: now, window_ms: windowMs });
            return { count: 1, window_start: now };
          }

          // Check if window expired
          if (now > existing.window_start + existing.window_ms) {
            // Window expired - reset to count=1
            testBuckets.set(key, { count: 1, window_start: now, window_ms: windowMs });
            return { count: 1, window_start: now };
          }

          // Window still valid - increment
          existing.count++;
          return { count: existing.count, window_start: existing.window_start };
        }
        // Handle checkRateLimit's SELECT query
        if (sql.includes('SELECT count, window_start FROM rate_limit_buckets')) {
          const key = params[0] as string;
          return testBuckets.get(key);
        }
        if (sql.includes('SELECT COUNT')) {
          let totalRequests = 0;
          for (const b of testBuckets.values()) totalRequests += b.count;
          return { bucket_count: testBuckets.size, total_requests: totalRequests };
        }
        return undefined;
      },
      run: async (...params: unknown[]) => {
        if (sql.includes('DELETE FROM rate_limit_buckets WHERE key')) {
          const key = params[0] as string;
          testBuckets.delete(key);
          return { changes: 1, lastInsertRowid: 0 };
        }
        if (sql.includes('DELETE FROM rate_limit_buckets') && !sql.includes('WHERE key')) {
          if (sql.includes('window_start + window_ms <')) {
            const now = params[0] as number;
            let deleted = 0;
            for (const [key, bucket] of testBuckets.entries()) {
              if (bucket.window_start + bucket.window_ms < now) {
                testBuckets.delete(key);
                deleted++;
              }
            }
            return { changes: deleted, lastInsertRowid: 0 };
          }
          testBuckets.clear();
          return { changes: 0, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      },
      all: async () => [],
    }),
    exec: async () => {},
    transaction: async <T>(fn: () => Promise<T>) => fn(),
    batch: async () => [],
  };

  return {
    getDatabase: async () => mockDb,
  };
});

describe('rateLimit', () => {
  beforeEach(async () => {
    testBuckets.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', async () => {
    const key = 'test-key';
    const limit = 5;
    const windowMs = 60000;

    for (let i = 0; i < limit; i++) {
      const result = await rateLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }
  });

  it('blocks requests over the limit', async () => {
    const key = 'test-key';
    const limit = 3;
    const windowMs = 60000;

    // Use up all requests
    for (let i = 0; i < limit; i++) {
      await rateLimit(key, limit, windowMs);
    }

    // Next request should be blocked
    const result = await rateLimit(key, limit, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('resets after window expires', async () => {
    const key = 'test-key';
    const limit = 2;
    const windowMs = 1000; // 1 second

    // Use up all requests
    await rateLimit(key, limit, windowMs);
    await rateLimit(key, limit, windowMs);

    // Should be blocked
    expect((await rateLimit(key, limit, windowMs)).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 100);

    // Should be allowed again (bucket expired)
    const result = await rateLimit(key, limit, windowMs);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it('handles multiple keys independently', async () => {
    const limit = 2;
    const windowMs = 60000;

    // Use up key1
    await rateLimit('key1', limit, windowMs);
    await rateLimit('key1', limit, windowMs);
    expect((await rateLimit('key1', limit, windowMs)).allowed).toBe(false);

    // key2 should still be allowed
    expect((await rateLimit('key2', limit, windowMs)).allowed).toBe(true);
  });
});

describe('checkRateLimit', () => {
  beforeEach(async () => {
    testBuckets.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns status without consuming request', async () => {
    const key = 'test-key';
    const limit = 3;
    const windowMs = 60000;

    // Make 2 requests
    await rateLimit(key, limit, windowMs);
    await rateLimit(key, limit, windowMs);

    // Check should show 1 remaining (does not consume)
    const check = await checkRateLimit(key, limit, windowMs);
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(1);

    // Actually making request should show 0 remaining after
    const result = await rateLimit(key, limit, windowMs);
    expect(result.remaining).toBe(0);
  });

  it('returns full limit for unknown key', async () => {
    const result = await checkRateLimit('unknown', 10, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
  });
});

describe('resetRateLimit', () => {
  beforeEach(async () => {
    testBuckets.clear();
  });

  it('resets a specific key', async () => {
    const limit = 2;
    const windowMs = 60000;

    // Use up limit
    await rateLimit('key1', limit, windowMs);
    await rateLimit('key1', limit, windowMs);
    expect((await rateLimit('key1', limit, windowMs)).allowed).toBe(false);

    // Reset
    await resetRateLimit('key1');

    // Should be allowed again
    expect((await rateLimit('key1', limit, windowMs)).allowed).toBe(true);
    expect((await rateLimit('key1', limit, windowMs)).remaining).toBe(0);
  });

  it('does not affect other keys', async () => {
    const limit = 2;
    const windowMs = 60000;

    await rateLimit('key1', limit, windowMs);
    await rateLimit('key2', limit, windowMs);

    await resetRateLimit('key1');

    // key1 is reset
    expect((await rateLimit('key1', limit, windowMs)).remaining).toBe(limit - 1);
    // key2 still has 1 request recorded
    expect((await rateLimit('key2', limit, windowMs)).remaining).toBe(0);
  });
});

describe('clearAllRateLimits', () => {
  it('clears all buckets', async () => {
    await rateLimit('key1', 2, 60000);
    await rateLimit('key2', 2, 60000);

    expect((await getRateLimitStats()).bucketCount).toBe(2);

    await clearAllRateLimits();

    expect((await getRateLimitStats()).bucketCount).toBe(0);
  });
});

describe('getRateLimitStats', () => {
  beforeEach(async () => {
    testBuckets.clear();
  });

  it('returns correct bucket count', async () => {
    await rateLimit('key1', 10, 60000);
    await rateLimit('key2', 10, 60000);
    await rateLimit('key3', 10, 60000);

    const stats = await getRateLimitStats();
    expect(stats.bucketCount).toBe(3);
  });

  it('returns correct total requests', async () => {
    await rateLimit('key1', 10, 60000);
    await rateLimit('key1', 10, 60000);
    await rateLimit('key2', 10, 60000);

    const stats = await getRateLimitStats();
    expect(stats.totalRequests).toBe(3);
  });
});

describe('getClientId', () => {
  it('extracts CF-Connecting-IP header', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '1.2.3.4');
    headers.set('x-forwarded-for', '5.6.7.8');

    const result = getClientId({ headers });
    expect(result).toBe('1.2.3.4');
  });

  it('falls back to X-Forwarded-For', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '1.2.3.4, 5.6.7.8');

    const result = getClientId({ headers });
    expect(result).toBe('1.2.3.4');
  });

  it('falls back to X-Real-IP', () => {
    const headers = new Headers();
    headers.set('x-real-ip', '1.2.3.4');

    const result = getClientId({ headers });
    expect(result).toBe('1.2.3.4');
  });

  it('returns "unknown" when no headers', () => {
    const headers = new Headers();
    const result = getClientId({ headers });
    expect(result).toBe('unknown');
  });

  it('trims whitespace', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '  1.2.3.4  ');

    const result = getClientId({ headers });
    expect(result).toBe('1.2.3.4');
  });
});

describe('RATE_LIMITS', () => {
  it('defines expected endpoints', () => {
    expect(RATE_LIMITS.login).toBeDefined();
    expect(RATE_LIMITS.register).toBeDefined();
    expect(RATE_LIMITS.api).toBeDefined();
    expect(RATE_LIMITS.search).toBeDefined();
    expect(RATE_LIMITS.upload).toBeDefined();
    expect(RATE_LIMITS.vote).toBeDefined();
    expect(RATE_LIMITS.comment).toBeDefined();
    expect(RATE_LIMITS.report).toBeDefined();
    expect(RATE_LIMITS.download).toBeDefined();
  });

  it('login has stricter limits than api', () => {
    expect(RATE_LIMITS.login.limit).toBeLessThan(RATE_LIMITS.api.limit);
  });

  it('register has stricter limits than login', () => {
    // register: 5/10min = 0.5/min, login: 10/min
    const registerPerMin = RATE_LIMITS.register.limit / (RATE_LIMITS.register.windowMs / 60000);
    const loginPerMin = RATE_LIMITS.login.limit / (RATE_LIMITS.login.windowMs / 60000);
    expect(registerPerMin).toBeLessThan(loginPerMin);
  });
});

describe('applyRateLimit', () => {
  beforeEach(async () => {
    testBuckets.clear();
  });

  it('uses predefined config for endpoint', async () => {
    const result = await applyRateLimit('client123', 'login');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.login.limit - 1);
  });

  it('creates unique key per client and endpoint', async () => {
    await applyRateLimit('client1', 'login');
    await applyRateLimit('client2', 'login');
    await applyRateLimit('client1', 'register');

    const stats = await getRateLimitStats();
    expect(stats.bucketCount).toBe(3);
  });
});
