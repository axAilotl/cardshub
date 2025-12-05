// Sharp is dynamically imported to avoid crashes on Cloudflare Workers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpModule: any = null;

export interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export type ThumbnailType = 'main' | 'asset';

const CONFIG = {
  main: { portrait: 500, landscape: 1024, quality: 80 },
  asset: { portrait: 300, landscape: 600, quality: 70 },
};

/**
 * Generate a thumbnail buffer from an image buffer
 * Does NOT write to disk.
 * Note: Only works on Node.js (requires sharp). Returns null on Cloudflare Workers.
 */
export async function generateThumbnailBuffer(
  imageBuffer: Buffer,
  type: ThumbnailType = 'main'
): Promise<ThumbnailResult> {
  // Dynamically import sharp only when needed (Node.js only)
  if (!sharpModule) {
    try {
      sharpModule = (await import('sharp')).default;
    } catch {
      throw new Error('Sharp is not available in this environment');
    }
  }

  const config = CONFIG[type];

  const image = sharpModule(imageBuffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 500;
  const originalHeight = metadata.height || 500;
  const isLandscape = originalWidth > originalHeight;

  // Fixed width based on orientation
  const targetWidth = isLandscape ? config.landscape : config.portrait;
  const width = targetWidth;
  const height = Math.round((originalHeight * targetWidth) / originalWidth);

  const buffer = await image
    .resize(width, height)
    .webp({ quality: config.quality })
    .toBuffer();

  return {
    buffer,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}

// Deprecated: Removed fs-based generateThumbnail
// Use generateThumbnailBuffer and store() instead.