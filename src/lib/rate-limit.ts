/**
 * Sliding window rate limiter with configurable limits per endpoint.
 * Uses D1/SQLite for persistence across serverless/edge instances.
 *
 * Schema required in rate_limit_buckets table:
 *   key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER, window_ms INTEGER
 */

import { getDatabase } from '@/lib/db/async-db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/**
 * Sliding window rate limiter using database for persistence.
 * Works correctly on serverless/edge (Cloudflare Workers, Vercel Edge, etc.)
 *
 * Uses atomic UPSERT to prevent race conditions where concurrent requests
 * could bypass the limit by reading the same count before incrementing.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const db = await getDatabase();
  const now = Date.now();

  // Atomic upsert with RETURNING - prevents race conditions
  // If key doesn't exist: inserts with count=1
  // If key exists but window expired: resets to count=1 with new window
  // If key exists and window valid: increments count
  const result = await db.prepare(`
    INSERT INTO rate_limit_buckets (key, count, window_start, window_ms)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE
        WHEN ? > window_start + window_ms THEN 1
        ELSE count + 1
      END,
      window_start = CASE
        WHEN ? > window_start + window_ms THEN ?
        ELSE window_start
      END,
      window_ms = ?
    RETURNING count, window_start
  `).get<{ count: number; window_start: number }>(
    key, now, windowMs,  // INSERT values
    now, now, now, windowMs  // UPDATE case checks and values
  );

  if (!result) {
    // Fallback if RETURNING not supported (shouldn't happen)
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  const { count, window_start } = result;
  const resetAt = window_start + windowMs;

  if (count > limit) {
    const retryAfter = Math.ceil((resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  return {
    allowed: true,
    remaining: limit - count,
    resetAt,
  };
}

/**
 * Check rate limit without consuming a request.
 * Useful for preflight checks.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const db = await getDatabase();
  const now = Date.now();
  const windowStart = now - windowMs;

  const bucket = await db.prepare(`
    SELECT count, window_start FROM rate_limit_buckets WHERE key = ?
  `).get<{ count: number; window_start: number }>(key);

  if (!bucket || bucket.window_start < windowStart) {
    return {
      allowed: true,
      remaining: limit,
      resetAt: now + windowMs,
    };
  }

  const count = bucket.count;
  const resetAt = bucket.window_start + windowMs;

  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfter: count >= limit ? Math.ceil((resetAt - now) / 1000) : undefined,
  };
}

/**
 * Reset rate limit for a key.
 * Useful for testing or admin overrides.
 */
export async function resetRateLimit(key: string): Promise<void> {
  const db = await getDatabase();
  await db.prepare(`DELETE FROM rate_limit_buckets WHERE key = ?`).run(key);
}

/**
 * Clear all rate limits.
 * Useful for testing.
 */
export async function clearAllRateLimits(): Promise<void> {
  const db = await getDatabase();
  await db.prepare(`DELETE FROM rate_limit_buckets`).run();
}

/**
 * Get current bucket count for debugging/monitoring.
 */
export async function getRateLimitStats(): Promise<{ bucketCount: number; totalRequests: number }> {
  const db = await getDatabase();
  const stats = await db.prepare(`
    SELECT COUNT(*) as bucket_count, COALESCE(SUM(count), 0) as total_requests
    FROM rate_limit_buckets
  `).get<{ bucket_count: number; total_requests: number }>();

  return {
    bucketCount: stats?.bucket_count || 0,
    totalRequests: stats?.total_requests || 0,
  };
}

/**
 * Cleanup expired rate limit buckets.
 * Call periodically (e.g., via cron or at startup).
 */
export async function cleanupExpiredBuckets(): Promise<number> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.prepare(`
    DELETE FROM rate_limit_buckets WHERE window_start + window_ms < ?
  `).run(now);
  return result.changes;
}

/**
 * Extract client identifier from request headers.
 * Prefers CF-Connecting-IP (Cloudflare) > X-Forwarded-For > X-Real-IP
 */
export function getClientId(request: Request | { headers: Headers }): string {
  const headers = request instanceof Request ? request.headers : request.headers;

  // Cloudflare's connecting IP (most reliable when behind CF)
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // X-Forwarded-For (first IP in chain is client)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // X-Real-IP (some proxies use this)
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

// Predefined rate limit configurations for different endpoints
export const RATE_LIMITS = {
  // Auth endpoints - stricter limits
  login: { limit: 10, windowMs: 60_000 } as RateLimitConfig,           // 10/min
  register: { limit: 5, windowMs: 10 * 60_000 } as RateLimitConfig,    // 5/10min
  passwordReset: { limit: 3, windowMs: 60 * 60_000 } as RateLimitConfig, // 3/hour

  // API endpoints - standard limits
  api: { limit: 100, windowMs: 60_000 } as RateLimitConfig,            // 100/min
  search: { limit: 30, windowMs: 60_000 } as RateLimitConfig,          // 30/min
  upload: { limit: 10, windowMs: 60_000 } as RateLimitConfig,          // 10/min

  // Interaction endpoints
  vote: { limit: 60, windowMs: 60_000 } as RateLimitConfig,            // 60/min
  comment: { limit: 20, windowMs: 60_000 } as RateLimitConfig,         // 20/min
  report: { limit: 10, windowMs: 60 * 60_000 } as RateLimitConfig,     // 10/hour

  // Download - generous but tracked
  download: { limit: 100, windowMs: 60_000 } as RateLimitConfig,       // 100/min
} as const;

/**
 * Apply rate limit using predefined configuration.
 */
export async function applyRateLimit(
  clientId: string,
  endpoint: keyof typeof RATE_LIMITS
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[endpoint];
  return rateLimit(`${endpoint}:${clientId}`, config.limit, config.windowMs);
}
