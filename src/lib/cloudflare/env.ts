/**
 * Cloudflare Environment Bindings
 *
 * This module provides access to Cloudflare bindings (D1, R2, etc.)
 * when running on Cloudflare Workers via OpenNext.
 */

import type { D1Database, R2Bucket, Fetcher, IncomingRequestCfProperties, ExecutionContext } from '@cloudflare/workers-types';

// Cloudflare environment bindings
export interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

// Type for the Cloudflare context from getCloudflareContext()
export interface CloudflareContext {
  env: CloudflareEnv;
  cf: IncomingRequestCfProperties;
  ctx: ExecutionContext;
}

// Import the official function from OpenNext
export async function getCloudflareContext(): Promise<CloudflareContext | null> {
  try {
    // Dynamic import to avoid issues during build
    const { getCloudflareContext: getCtx } = await import('@opennextjs/cloudflare');
    return getCtx() as CloudflareContext;
  } catch {
    return null;
  }
}

/**
 * Check if running in Cloudflare environment
 */
export function isCloudflare(): boolean {
  return typeof globalThis !== 'undefined' && 'caches' in globalThis && !process.env.DATABASE_PATH;
}

/**
 * Get D1 database from Cloudflare context
 * Must be called from an async context (API route, etc.)
 */
export async function getD1(): Promise<D1Database | null> {
  const ctx = await getCloudflareContext();
  return ctx?.env.DB ?? null;
}

/**
 * Get R2 bucket from Cloudflare context
 * Must be called from an async context (API route, etc.)
 */
export async function getR2(): Promise<R2Bucket | null> {
  const ctx = await getCloudflareContext();
  return ctx?.env.R2 ?? null;
}

/**
 * Get Discord credentials from environment
 * Works on both Node.js (process.env) and Cloudflare (context.env)
 */
export async function getDiscordCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  // On OpenNext/Cloudflare, vars from wrangler.toml should be in process.env
  // Secrets set via `wrangler secret` should also be available

  // Check process.env first (works in both Node.js and OpenNext/Cloudflare)
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  console.log('[Discord Auth] process.env.DISCORD_CLIENT_ID:', clientId ? `set (${clientId.substring(0, 5)}...)` : 'not set');
  console.log('[Discord Auth] process.env.DISCORD_CLIENT_SECRET:', clientSecret ? 'set' : 'not set');

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  // Try Cloudflare context as fallback
  const ctx = await getCloudflareContext();
  console.log('[Discord Auth] Cloudflare context:', ctx ? 'available' : 'null');
  if (ctx?.env) {
    console.log('[Discord Auth] ctx.env keys:', Object.keys(ctx.env));
  }

  if (ctx?.env.DISCORD_CLIENT_ID && ctx?.env.DISCORD_CLIENT_SECRET) {
    return {
      clientId: ctx.env.DISCORD_CLIENT_ID,
      clientSecret: ctx.env.DISCORD_CLIENT_SECRET,
    };
  }

  console.log('[Discord Auth] No credentials found');
  return null;
}

/**
 * Get app URL from environment
 */
export async function getAppUrl(): Promise<string> {
  const ctx = await getCloudflareContext();
  return ctx?.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
