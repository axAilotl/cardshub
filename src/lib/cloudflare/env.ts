/**
 * Cloudflare Environment Bindings
 *
 * This module provides access to Cloudflare bindings (D1, R2, etc.)
 * in both Pages and Workers environments.
 */

import type { D1Database } from '../db/d1';
import type { R2Bucket } from '../storage/r2';

// Cloudflare environment bindings
export interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

// Extend globalThis for Cloudflare bindings access
declare global {
  // eslint-disable-next-line no-var
  var __cf_env: CloudflareEnv | undefined;
}

/**
 * Set Cloudflare environment bindings (called by middleware)
 */
export function setCloudflareEnv(env: CloudflareEnv): void {
  globalThis.__cf_env = env;
}

/**
 * Get Cloudflare environment bindings
 */
export function getCloudflareEnv(): CloudflareEnv | undefined {
  return globalThis.__cf_env;
}

/**
 * Check if running in Cloudflare environment
 */
export function isCloudflare(): boolean {
  return globalThis.__cf_env !== undefined;
}

/**
 * Get D1 database binding
 */
export function getD1(): D1Database | undefined {
  return globalThis.__cf_env?.DB;
}

/**
 * Get R2 bucket binding
 */
export function getR2(): R2Bucket | undefined {
  return globalThis.__cf_env?.R2;
}
