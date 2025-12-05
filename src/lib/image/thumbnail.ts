import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ThumbnailResult {
  path: string;
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
 * Generate a thumbnail from an image buffer
 * @param imageBuffer - The source image buffer
 * @param outputPath - Full filesystem path for output (without extension)
 * @param type - 'main' for card thumbnails, 'asset' for asset thumbnails
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  outputPath: string,
  type: ThumbnailType = 'main'
): Promise<ThumbnailResult> {
  const config = CONFIG[type];

  // Ensure directory exists
  const dir = join(outputPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 500;
  const originalHeight = metadata.height || 500;
  const isLandscape = originalWidth > originalHeight;

  // Fixed width based on orientation
  const targetWidth = isLandscape ? config.landscape : config.portrait;
  const width = targetWidth;
  const height = Math.round((originalHeight * targetWidth) / originalWidth);

  const fullPath = `${outputPath}.webp`;

  const buffer = await image
    .resize(width, height)
    .webp({ quality: config.quality })
    .toBuffer();

  writeFileSync(fullPath, buffer);

  return {
    path: fullPath,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}
