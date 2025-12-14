/**
 * Drizzle ORM Client
 *
 * Provides a type-safe Drizzle ORM instance for both:
 * - better-sqlite3 (local development)
 * - Cloudflare D1 (production)
 *
 * Usage:
 * ```typescript
 * import { getDrizzle } from '@/lib/db/drizzle';
 *
 * const db = await getDrizzle();
 * const cards = await db.select().from(schema.cards).where(eq(schema.cards.visibility, 'public'));
 * ```
 */

import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleBetterSqlite } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';
import { isCloudflare } from './async-db';

// Re-export schema for convenience
export * from './schema';

// Re-export common Drizzle helpers
export { eq, ne, gt, gte, lt, lte, and, or, not, isNull, isNotNull, inArray, notInArray, like, sql, desc, asc } from 'drizzle-orm';

// Type for our Drizzle database (union of both)
export type DrizzleDb = BetterSQLite3Database<typeof schema> | DrizzleD1Database<typeof schema>;

// Cached instances
let localDrizzleInstance: BetterSQLite3Database<typeof schema> | null = null;
let d1DrizzleInstance: DrizzleD1Database<typeof schema> | null = null;

/**
 * Get Drizzle instance for local development (better-sqlite3)
 */
async function getLocalDrizzle(): Promise<BetterSQLite3Database<typeof schema>> {
  if (localDrizzleInstance) return localDrizzleInstance;

  const [betterSqlite, pathModule] = await Promise.all([
    import('better-sqlite3'),
    import('path'),
  ]);

  const Database = betterSqlite.default;
  const { join } = pathModule;

  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'cardshub.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  localDrizzleInstance = drizzleBetterSqlite(sqlite, { schema });
  return localDrizzleInstance;
}

/**
 * Get Drizzle instance for D1 (Cloudflare production)
 */
async function getD1Drizzle(): Promise<DrizzleD1Database<typeof schema>> {
  if (d1DrizzleInstance) return d1DrizzleInstance;

  const { getD1 } = await import('@/lib/cloudflare/env');
  const d1 = await getD1();
  if (!d1) {
    throw new Error('D1 database binding not available');
  }

  d1DrizzleInstance = drizzleD1(d1, { schema });
  return d1DrizzleInstance;
}

/**
 * Get Drizzle database instance (unified helper for both environments)
 */
export async function getDrizzle(): Promise<DrizzleDb> {
  if (isCloudflare()) {
    return await getD1Drizzle();
  }
  return await getLocalDrizzle();
}

/**
 * Close/reset Drizzle instances (useful for testing)
 */
export function closeDrizzle(): void {
  localDrizzleInstance = null;
  d1DrizzleInstance = null;
}
