/**
 * Client-side presigned URL upload utilities
 *
 * Handles the flow:
 * 1. Request presigned URLs from server
 * 2. Upload files directly to R2
 * 3. Confirm upload with metadata
 */

import type { ParseResultWithAssets } from './card-parser';

export interface UploadProgress {
  stage: 'presigning' | 'uploading' | 'confirming' | 'done' | 'error';
  percent: number;
  currentFile?: string;
  error?: string;
}

export interface PresignedUploadResult {
  success: boolean;
  slug?: string;
  isCollection?: boolean;
  error?: string;
}

interface PresignResponse {
  sessionId: string;
  urls: Record<string, { uploadUrl: string; r2Key: string }>;
  expiresAt: number;
}

interface FileDescriptor {
  key: string;
  filename: string;
  size: number;
  contentType: string;
}

/**
 * Check if presigned uploads are available
 */
export async function checkPresignedAvailable(): Promise<boolean> {
  try {
    // Make a test request to see if the endpoint is configured
    const response = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: crypto.randomUUID(),
        files: [{ key: 'test', filename: 'test.txt', size: 1, contentType: 'text/plain' }],
      }),
    });
    // 503 means not configured, 401 means it exists but needs auth
    return response.status !== 503;
  } catch {
    return false;
  }
}

/**
 * Upload a card using presigned URLs
 */
export async function uploadWithPresignedUrls(
  file: File,
  parseResult: ParseResultWithAssets,
  visibility: 'public' | 'private' | 'unlisted',
  contentHash: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<PresignedUploadResult> {
  const sessionId = crypto.randomUUID();

  try {
    // Stage 1: Request presigned URLs
    onProgress?.({ stage: 'presigning', percent: 0 });

    const filesToUpload: FileDescriptor[] = [];

    // Add original file
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    filesToUpload.push({
      key: 'original',
      filename: `card.${ext}`,
      size: file.size,
      contentType: getContentType(ext),
    });

    // Add icon if available
    if (parseResult.mainImage) {
      filesToUpload.push({
        key: 'icon',
        filename: 'icon.png',
        size: parseResult.mainImage.byteLength,
        contentType: 'image/png',
      });
    }

    // Add extracted assets
    if (parseResult.extractedAssets) {
      parseResult.extractedAssets.forEach((asset, index) => {
        filesToUpload.push({
          key: `asset-${index}`,
          filename: `${asset.name}.${asset.ext}`,
          size: asset.buffer.byteLength,
          contentType: getContentType(asset.ext),
        });
      });
    }

    // Request presigned URLs
    const presignResponse = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, files: filesToUpload }),
    });

    if (!presignResponse.ok) {
      const error = await presignResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to get upload URLs');
    }

    const presignData: PresignResponse = await presignResponse.json();
    onProgress?.({ stage: 'presigning', percent: 100 });

    // Stage 2: Upload files to R2
    onProgress?.({ stage: 'uploading', percent: 0 });

    const totalFiles = filesToUpload.length;
    let uploadedFiles = 0;

    // Upload original file
    onProgress?.({ stage: 'uploading', percent: 0, currentFile: file.name });
    await uploadToR2(presignData.urls.original.uploadUrl, file, getContentType(ext));
    uploadedFiles++;
    onProgress?.({ stage: 'uploading', percent: Math.round((uploadedFiles / totalFiles) * 100) });

    // Upload icon
    if (parseResult.mainImage && presignData.urls.icon) {
      onProgress?.({ stage: 'uploading', percent: Math.round((uploadedFiles / totalFiles) * 100), currentFile: 'icon.png' });
      // Convert Uint8Array to Blob (need to wrap in array as Uint8Array)
      const iconBlob = new Blob([new Uint8Array(parseResult.mainImage)], { type: 'image/png' });
      await uploadToR2(presignData.urls.icon.uploadUrl, iconBlob, 'image/png');
      uploadedFiles++;
      onProgress?.({ stage: 'uploading', percent: Math.round((uploadedFiles / totalFiles) * 100) });
    }

    // Upload assets
    if (parseResult.extractedAssets) {
      for (let i = 0; i < parseResult.extractedAssets.length; i++) {
        const asset = parseResult.extractedAssets[i];
        const assetKey = `asset-${i}`;
        const assetUrl = presignData.urls[assetKey];
        if (assetUrl) {
          onProgress?.({ stage: 'uploading', percent: Math.round((uploadedFiles / totalFiles) * 100), currentFile: `${asset.name}.${asset.ext}` });
          const assetBlob = new Blob([new Uint8Array(asset.buffer)], { type: getContentType(asset.ext) });
          await uploadToR2(assetUrl.uploadUrl, assetBlob, getContentType(asset.ext));
          uploadedFiles++;
          onProgress?.({ stage: 'uploading', percent: Math.round((uploadedFiles / totalFiles) * 100) });
        }
      }
    }

    // Stage 3: Confirm upload
    onProgress?.({ stage: 'confirming', percent: 0 });

    const { card } = parseResult;
    const confirmBody = {
      sessionId,
      metadata: {
        name: card.name,
        description: card.description || '',
        creator: card.creator || '',
        creatorNotes: card.creatorNotes || '',
        specVersion: card.specVersion,
        sourceFormat: card.sourceFormat,
        tokens: card.tokens,
        metadata: card.metadata,
        tags: card.tags,
        contentHash,
        cardData: JSON.stringify(card.raw),
      },
      files: {
        original: { r2Key: presignData.urls.original.r2Key },
        ...(presignData.urls.icon && { icon: { r2Key: presignData.urls.icon.r2Key } }),
        assets: parseResult.extractedAssets?.map((asset, i) => ({
          r2Key: presignData.urls[`asset-${i}`]?.r2Key || '',
          name: asset.name,
          type: asset.type,
          ext: asset.ext,
        })).filter(a => a.r2Key) || [],
      },
      visibility,
    };

    const confirmResponse = await fetch('/api/uploads/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmBody),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to confirm upload');
    }

    const confirmData = await confirmResponse.json();
    onProgress?.({ stage: 'done', percent: 100 });

    return {
      success: true,
      slug: confirmData.data.slug,
      isCollection: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    onProgress?.({ stage: 'error', percent: 0, error: message });
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Upload a file/blob directly to R2 using a presigned URL
 */
async function uploadToR2(url: string, data: File | Blob, contentType: string): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: data,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status}`);
  }
}

/**
 * Get content type from file extension
 */
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    json: 'application/json',
    charx: 'application/zip',
    voxpkg: 'application/zip',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}
