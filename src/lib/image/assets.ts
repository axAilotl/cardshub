import { convertToWebp } from './process';
import { store, getPublicUrl } from '@/lib/storage';
import { isCloudflare, getR2 } from '@/lib/cloudflare/env';
import { isCloudflareRuntime } from '@/lib/db';

export interface ExtractedAsset {
  name: string;
  type: string;
  ext: string;
  buffer: Buffer | Uint8Array;
  path?: string;
}

export interface SavedAsset {
  name: string;
  type: string;
  ext: string;
  path: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
}

export interface SaveAssetsResult {
  assets: SavedAsset[];
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'];

// Asset thumbnail size (smaller than main thumbnails)
const ASSET_THUMB_SIZE = { width: 300, height: 300 };

/**
 * Save extracted assets using the configured storage driver
 * Structure: assets/{cardId}/{filename}
 */
// Process a single asset - returns SavedAsset or null on error
async function processAsset(
  cardId: string,
  asset: ExtractedAsset,
  index: number
): Promise<SavedAsset | null> {
  try {
    const safeFileName = `${index}_${sanitizeFileName(asset.name)}.${asset.ext}`;
    const storagePath = `assets/${cardId}/${safeFileName}`;

    // Store asset (ensure it's a Buffer)
    const bufferData = Buffer.isBuffer(asset.buffer) ? asset.buffer : Buffer.from(asset.buffer);
    await store(bufferData, storagePath);
    const publicUrl = getPublicUrl(isCloudflare() ? `r2://${storagePath}` : `file:///${storagePath}`);

    const savedAsset: SavedAsset = {
      name: asset.name,
      type: asset.type,
      ext: asset.ext,
      path: publicUrl,
    };

    // Generate thumbnail for images
    if (isImageFile(asset.ext)) {
      // Get dimensions from image buffer if PNG
      if (asset.ext.toLowerCase() === 'png' && bufferData.length > 24) {
        savedAsset.width = bufferData.readUInt32BE(16);
        savedAsset.height = bufferData.readUInt32BE(20);
      }

      // Process and store thumbnail
      try {
        const processed = await convertToWebp(new Uint8Array(bufferData), {
          width: ASSET_THUMB_SIZE.width,
          height: ASSET_THUMB_SIZE.height,
          quality: 70,
        });

        const thumbPath = `thumbs/assets/${cardId}/${index}_${sanitizeFileName(asset.name)}.webp`;

        // Store in R2 or local filesystem
        if (isCloudflareRuntime()) {
          const r2 = await getR2();
          if (r2) {
            await r2.put(thumbPath, processed.data, {
              httpMetadata: { contentType: 'image/webp' },
            });
          }
        } else {
          const fs = await import('fs');
          const nodePath = await import('path');
          const uploadsDir = process.env.UPLOADS_DIR || nodePath.join(process.cwd(), 'uploads');
          const fullPath = nodePath.join(uploadsDir, thumbPath);

          const dir = nodePath.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(fullPath, Buffer.from(processed.data));
        }

        savedAsset.thumbnailPath = `/api/uploads/${thumbPath}`;
      } catch (error) {
        console.error(`Failed to generate thumbnail for asset ${asset.name}:`, error);
        // No fallback - just don't set thumbnailPath
      }
    }

    return savedAsset;
  } catch (error) {
    console.error(`Failed to save asset ${asset.name}:`, error);
    return null;
  }
}

// Parallel batch processing with concurrency limit
const BATCH_SIZE = 20; // Process 20 assets concurrently

export async function saveAssets(
  cardId: string,
  extractedAssets: ExtractedAsset[]
): Promise<SaveAssetsResult> {
  if (extractedAssets.length === 0) {
    return { assets: [] };
  }

  const savedAssets: SavedAsset[] = [];

  // Process in parallel batches
  for (let i = 0; i < extractedAssets.length; i += BATCH_SIZE) {
    const batch = extractedAssets.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((asset, batchIndex) =>
      processAsset(cardId, asset, i + batchIndex)
    );

    const results = await Promise.all(batchPromises);
    for (const result of results) {
      if (result) savedAssets.push(result);
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
