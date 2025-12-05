import type { StorageDriver } from './index';

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob, options?: R2PutOptions): Promise<R2Object>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  head(key: string): Promise<R2Object | null>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: Date;
  };
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha384?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
}

export interface R2GetOptions {
  onlyIf?: R2Conditional;
  range?: R2Range;
}

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

export interface R2HttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

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
