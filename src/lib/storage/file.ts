/**
 * File Storage Driver
 *
 * Stores blobs on the local filesystem.
 * Storage URLs: file:///path/relative/to/uploads
 */

import { readFile, writeFile, unlink, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { StorageDriver } from './index';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export class FileStorageDriver implements StorageDriver {
  private uploadsDir: string;

  constructor(uploadsDir: string = UPLOADS_DIR) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Store a blob and return its storage URL
   * @param data - The blob data
   * @param path - Relative path within uploads directory (e.g., "cards/abc123.png")
   */
  async store(data: Buffer, path: string): Promise<string> {
    const fullPath = join(this.uploadsDir, path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Write file
    await writeFile(fullPath, data);

    // Return storage URL
    return `file:///${path}`;
  }

  /**
   * Retrieve a blob by its storage URL
   */
  async retrieve(url: string): Promise<Buffer> {
    const path = this.urlToPath(url);
    return readFile(path);
  }

  /**
   * Delete a blob by its storage URL
   */
  async delete(url: string): Promise<void> {
    const path = this.urlToPath(url);
    try {
      await unlink(path);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if a blob exists
   */
  async exists(url: string): Promise<boolean> {
    const path = this.urlToPath(url);
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the public URL for serving
   * For file storage, we serve via /api/uploads/
   */
  getPublicUrl(url: string): string {
    // file:///cards/abc123.png -> /api/uploads/cards/abc123.png
    const path = url.replace(/^file:\/\/\//, '');
    return `/api/uploads/${path}`;
  }

  /**
   * Convert a storage URL to a filesystem path
   */
  private urlToPath(url: string): string {
    // file:///cards/abc123.png -> /path/to/uploads/cards/abc123.png
    const relativePath = url.replace(/^file:\/\/\//, '');
    return join(this.uploadsDir, relativePath);
  }
}
