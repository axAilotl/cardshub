import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ExtractedAsset } from '@/lib/card-parser';
import { generateThumbnail } from './thumbnail';

export interface SavedAsset {
  name: string;
  type: string;
  ext: string;
  path: string;
  fullPath: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
}

export interface SaveAssetsResult {
  assets: SavedAsset[];
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'];

/**
 * Save extracted assets to disk (NOT the main image - that goes in /uploads/)
 * Creates directory structure: uploads/assets/{cardId}/
 */
export async function saveAssets(
  cardId: string,
  extractedAssets: ExtractedAsset[]
): Promise<SaveAssetsResult> {
  if (extractedAssets.length === 0) {
    return { assets: [] };
  }

  const assetsDir = join(process.cwd(), 'uploads', 'assets', cardId);
  const thumbnailsDir = join(assetsDir, 'thumbnails');

  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }
  if (!existsSync(thumbnailsDir)) {
    mkdirSync(thumbnailsDir, { recursive: true });
  }

  const savedAssets: SavedAsset[] = [];

  for (let i = 0; i < extractedAssets.length; i++) {
    const asset = extractedAssets[i];

    try {
      const safeFileName = `${i}_${sanitizeFileName(asset.name)}.${asset.ext}`;
      const fullPath = join(assetsDir, safeFileName);
      const urlPath = `/uploads/assets/${cardId}/${safeFileName}`;

      writeFileSync(fullPath, asset.buffer);

      const savedAsset: SavedAsset = {
        name: asset.name,
        type: asset.type,
        ext: asset.ext,
        path: urlPath,
        fullPath,
      };

      // Generate thumbnail for images
      if (isImageFile(asset.ext)) {
        try {
          const baseName = `${i}_${sanitizeFileName(asset.name)}`;
          const thumbResult = await generateThumbnail(
            asset.buffer,
            join(thumbnailsDir, baseName),
            'asset'
          );
          savedAsset.thumbnailPath = `/uploads/assets/${cardId}/thumbnails/${baseName}.webp`;
          savedAsset.width = thumbResult.originalWidth;
          savedAsset.height = thumbResult.originalHeight;
        } catch (error) {
          console.error(`Failed to generate thumbnail for asset ${asset.name}:`, error);
        }
      }

      savedAssets.push(savedAsset);
    } catch (error) {
      console.error(`Failed to save asset ${asset.name}:`, error);
    }
  }

  return { assets: savedAssets };
}

function isImageFile(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}
