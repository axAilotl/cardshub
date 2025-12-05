/**
 * Storage Abstraction Layer
 *
 * Provides a unified interface for storing and retrieving blobs.
 * Storage URLs use schemes to identify the backend:
 * - file:///path/to/file (local filesystem)
 * - s3://bucket/key (AWS S3 - future)
 * - ipfs://Qm... (IPFS - future)
 */

import { R2StorageDriver } from './r2';
import { isCloudflare } from '@/lib/cloudflare/env';

export interface StorageDriver {
  /**
   * Store a blob and return its storage URL
   */
  store(data: Buffer, path: string): Promise<string>;

  /**
   * Retrieve a blob by its storage URL
   */
  retrieve(url: string): Promise<Buffer>;

  /**
   * Delete a blob by its storage URL
   */
  delete(url: string): Promise<void>;

  /**
   * Check if a blob exists
   */
  exists(url: string): Promise<boolean>;

  /**
   * Get the public URL for serving (if different from storage URL)
   */
  getPublicUrl(url: string): string;
}

// Storage driver registry
const drivers: Map<string, StorageDriver> = new Map();

// R2 driver is always available
const r2Driver = new R2StorageDriver();
drivers.set('r2', r2Driver);

// File driver is loaded dynamically (only on Node.js)
let fileDriverLoaded = false;
async function ensureFileDriver(): Promise<void> {
  if (fileDriverLoaded || isCloudflare()) return;
  try {
    const { FileStorageDriver } = await import('./file');
    drivers.set('file', new FileStorageDriver());
    fileDriverLoaded = true;
  } catch {
    // File driver not available
  }
}

/**
 * Get the appropriate driver for a storage URL
 */
async function getDriver(url: string): Promise<StorageDriver> {
  const scheme = url.split('://')[0];

  // Ensure file driver is loaded if needed
  if (scheme === 'file') {
    await ensureFileDriver();
  }

  const driver = drivers.get(scheme);

  if (!driver) {
    throw new Error(`No storage driver registered for scheme: ${scheme}`);
  }

  return driver;
}

/**
 * Register a storage driver for a URL scheme
 */
export function registerDriver(scheme: string, driver: StorageDriver): void {
  drivers.set(scheme, driver);
}

/**
 * Store a blob using the appropriate driver (file:// or r2://)
 * Defaults to R2 in Cloudflare, File otherwise
 */
export async function store(data: Buffer, path: string): Promise<string> {
  if (isCloudflare()) {
    return r2Driver.store(data, path);
  }
  // Load file driver dynamically for Node.js
  await ensureFileDriver();
  const fileDriver = drivers.get('file');
  if (!fileDriver) {
    throw new Error('File storage driver not available');
  }
  return fileDriver.store(data, path);
}

/**
 * Retrieve a blob by its storage URL
 */
export async function retrieve(url: string): Promise<Buffer> {
  const driver = await getDriver(url);
  return driver.retrieve(url);
}

/**
 * Delete a blob by its storage URL
 */
export async function deleteBlob(url: string): Promise<void> {
  const driver = await getDriver(url);
  return driver.delete(url);
}

/**
 * Check if a blob exists
 */
export async function exists(url: string): Promise<boolean> {
  const driver = await getDriver(url);
  return driver.exists(url);
}

/**
 * Get the public URL for serving
 */
export function getPublicUrl(url: string): string {
  // For getPublicUrl, we use synchronous access since it doesn't need async loading
  const scheme = url.split('://')[0];
  if (scheme === 'r2') {
    return r2Driver.getPublicUrl(url);
  }
  // For file URLs, use static path transformation
  const path = url.replace(/^file:\/\/\//, '');
  return `/api/uploads/${path}`;
}

/**
 * Parse a storage URL into scheme and path
 */
export function parseStorageUrl(url: string): { scheme: string; path: string } {
  const match = url.match(/^([a-z]+):\/\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid storage URL: ${url}`);
  }
  return { scheme: match[1], path: match[2] };
}

/**
 * Build a storage URL from scheme and path
 */
export function buildStorageUrl(scheme: string, path: string): string {
  return `${scheme}://${path}`;
}
