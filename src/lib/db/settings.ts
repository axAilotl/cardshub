/**
 * Admin Settings Database Functions
 *
 * Provides typed access to admin settings stored in the database.
 * Settings are cached in memory with a short TTL for performance.
 */

import { getDatabase } from './async-db';

// Known setting keys with their types
export const SETTING_KEYS = {
  IMAGE_PROXY_ENABLED: 'image_proxy_enabled',
  IMAGE_CACHE_ENABLED: 'image_cache_enabled',
  REGISTRATION_ENABLED: 'registration_enabled',
  UPLOADS_ENABLED: 'uploads_enabled',
  MAINTENANCE_MODE: 'maintenance_mode',
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

export interface AdminSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: number;
  updated_by: string | null;
}

// In-memory cache with TTL
const cache = new Map<string, { value: string; expiry: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get a setting value from the database (with caching)
 */
export async function getSetting(key: SettingKey): Promise<string | null> {
  // Check cache first
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const db = await getDatabase();
  const row = await db.prepare(
    'SELECT value FROM admin_settings WHERE key = ?'
  ).get<{ value: string }>(key);

  if (row) {
    cache.set(key, { value: row.value, expiry: Date.now() + CACHE_TTL_MS });
    return row.value;
  }

  return null;
}

/**
 * Get a boolean setting (parses 'true'/'false' strings)
 */
export async function getBooleanSetting(key: SettingKey): Promise<boolean> {
  const value = await getSetting(key);
  return value === 'true';
}

/**
 * Set a setting value in the database
 */
export async function setSetting(
  key: SettingKey,
  value: string,
  updatedBy?: string
): Promise<void> {
  const db = await getDatabase();

  await db.prepare(`
    INSERT INTO admin_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, unixepoch(), ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(key, value, updatedBy || null);

  // Invalidate cache
  cache.delete(key);
}

/**
 * Set a boolean setting
 */
export async function setBooleanSetting(
  key: SettingKey,
  value: boolean,
  updatedBy?: string
): Promise<void> {
  await setSetting(key, value ? 'true' : 'false', updatedBy);
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<AdminSetting[]> {
  const db = await getDatabase();
  const rows = await db.prepare(
    'SELECT key, value, description, updated_at, updated_by FROM admin_settings ORDER BY key'
  ).all<AdminSetting>();

  return rows;
}

/**
 * Clear the settings cache (useful after bulk updates)
 */
export function clearSettingsCache(): void {
  cache.clear();
}

// Convenience functions for specific settings

export async function isImageProxyEnabled(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.IMAGE_PROXY_ENABLED);
}

export async function isImageCacheEnabled(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.IMAGE_CACHE_ENABLED);
}

export async function isRegistrationEnabled(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.REGISTRATION_ENABLED);
}

export async function isUploadsEnabled(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.UPLOADS_ENABLED);
}

export async function isMaintenanceMode(): Promise<boolean> {
  return getBooleanSetting(SETTING_KEYS.MAINTENANCE_MODE);
}
