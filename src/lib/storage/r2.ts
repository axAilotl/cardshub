import type { StorageDriver } from './index';
import type { R2Bucket } from '@cloudflare/workers-types';

export type { R2Bucket };

let r2Bucket: R2Bucket | null = null;

export function initR2(bucket: R2Bucket): void {
  r2Bucket = bucket;
}

export function getR2(): R2Bucket {
  if (!r2Bucket) {
    throw new Error('R2 bucket not initialized. Call initR2() first.');
  }
  return r2Bucket;
}

export class R2StorageDriver implements StorageDriver {
  private bucket: R2Bucket;
  private publicUrl: string;

  constructor(bucket: R2Bucket, publicUrl: string = '') {
    this.bucket = bucket;
    this.publicUrl = publicUrl;
  }

  async store(data: Buffer, path: string): Promise<string> {
    const contentType = this.getContentType(path);

    await this.bucket.put(path, data, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return `r2://${path}`;
  }

  async retrieve(url: string): Promise<Buffer> {
    const path = this.extractPath(url);
    const object = await this.bucket.get(path);

    if (!object) {
      throw new Error(`Object not found: ${path}`);
    }

    const arrayBuffer = await object.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(url: string): Promise<void> {
    const path = this.extractPath(url);
    await this.bucket.delete(path);
  }

  async exists(url: string): Promise<boolean> {
    const path = this.extractPath(url);
    const head = await this.bucket.head(path);
    return head !== null;
  }

  getPublicUrl(url: string): string {
    const path = this.extractPath(url);
    if (this.publicUrl) {
      return `${this.publicUrl}/${path}`;
    }
    return `/api/uploads/${path}`;
  }

  private extractPath(url: string): string {
    if (url.startsWith('r2://')) {
      return url.slice(5);
    }
    return url;
  }

  private getContentType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'avif': 'image/avif',
      'json': 'application/json',
      'charx': 'application/zip',
      'voxpkg': 'application/zip',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
    };
    return types[ext || ''] || 'application/octet-stream';
  }
}

export function createR2Driver(bucket: R2Bucket, publicUrl?: string): R2StorageDriver {
  return new R2StorageDriver(bucket, publicUrl);
}
