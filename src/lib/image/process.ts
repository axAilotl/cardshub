/**
 * Image Processing Utility
 *
 * Handles downloading, converting, and storing processed images.
 * Works on both Node.js (Sharp) and Cloudflare Workers (IMAGES binding).
 *
 * Key principle: Process once at upload time, serve forever with zero transforms.
 */

import { isCloudflareRuntime } from '@/lib/db';
import { getR2, getImages } from '@/lib/cloudflare/env';
import crypto from 'crypto';

// Quality settings
const THUMBNAIL_QUALITY = 80;
const EMBEDDED_QUALITY = 70;

// Thumbnail dimensions
export const THUMB_SIZES = {
  main: { width: 500, height: 750 },
  grid: { width: 300, height: 450 },
} as const;

export interface ProcessedImage {
  data: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
}

export interface EmbeddedImageResult {
  originalUrl: string;
  newPath: string;  // Path in R2
  hash: string;
}

/**
 * Hash content for deduplication
 */
function hashContent(data: Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Extract embedded image URLs from text content
 * Handles markdown images, HTML images, and data URIs
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];

  // Markdown images: ![alt](url)
  const markdownPattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownPattern.exec(text)) !== null) {
    urls.push(match[1]);
  }

  // HTML images: <img src="url">
  const htmlPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlPattern.exec(text)) !== null) {
    urls.push(match[1]);
  }

  // Data URIs (these need to be converted too)
  const dataUriPattern = /(data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+)/g;
  while ((match = dataUriPattern.exec(text)) !== null) {
    urls.push(match[1]);
  }

  return [...new Set(urls)]; // Dedupe
}

/**
 * Download an image from a URL
 */
async function downloadImage(url: string): Promise<Uint8Array | null> {
  try {
    // Handle data URIs
    if (url.startsWith('data:image/')) {
      const base64Match = url.match(/base64,(.+)$/);
      if (base64Match) {
        const base64Data = base64Match[1];
        console.log(`[EmbeddedImages] Converting data URI (${base64Data.length} chars)`);
        return Uint8Array.from(Buffer.from(base64Data, 'base64'));
      }
      console.log(`[EmbeddedImages] Invalid data URI format`);
      return null;
    }

    // Download from URL
    console.log(`[EmbeddedImages] Downloading: ${url.substring(0, 100)}...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CardHub/1.0 (Image Fetcher)',
      },
    });

    if (!response.ok) {
      console.error(`[EmbeddedImages] Failed to download: ${url} - ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[EmbeddedImages] Downloaded ${arrayBuffer.byteLength} bytes`);
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error(`[EmbeddedImages] Error downloading ${url}:`, error);
    return null;
  }
}

/**
 * Convert image to WebP using Sharp (Node.js)
 */
async function convertWithSharp(
  data: Uint8Array,
  options: { width?: number; height?: number; quality: number }
): Promise<ProcessedImage> {
  const { default: sharp } = await import('sharp');

  let pipeline = sharp(Buffer.from(data));

  if (options.width && options.height) {
    pipeline = pipeline.resize(options.width, options.height, { fit: 'cover' });
  }

  const result = await pipeline.webp({ quality: options.quality }).toBuffer();

  return {
    data: new Uint8Array(result),
    contentType: 'image/webp',
    width: options.width,
    height: options.height,
  };
}

/**
 * Convert image to WebP using IMAGES binding (Cloudflare)
 */
async function convertWithImagesBinding(
  data: Uint8Array,
  options: { width?: number; height?: number; quality: number }
): Promise<ProcessedImage> {
  const images = await getImages();
  if (!images) {
    throw new Error('IMAGES binding not available');
  }

  let stream = images.input(data.buffer as ArrayBuffer);

  if (options.width && options.height) {
    stream = stream.transform({
      width: options.width,
      height: options.height,
      fit: 'cover',
    });
  }

  const output = await stream.output({
    format: 'image/webp',
    quality: options.quality,
  });

  const response = output.response();
  const arrayBuffer = await response.arrayBuffer();

  return {
    data: new Uint8Array(arrayBuffer),
    contentType: 'image/webp',
    width: options.width,
    height: options.height,
  };
}

/**
 * Convert image to WebP - auto-selects runtime
 */
export async function convertToWebp(
  data: Uint8Array,
  options: { width?: number; height?: number; quality?: number } = {}
): Promise<ProcessedImage> {
  const quality = options.quality ?? EMBEDDED_QUALITY;

  if (isCloudflareRuntime()) {
    return convertWithImagesBinding(data, { ...options, quality });
  } else {
    return convertWithSharp(data, { ...options, quality });
  }
}

/**
 * Process and store thumbnail from image data
 * Returns the R2 path where thumbnail is stored
 */
export async function processThumbnail(
  imageData: Uint8Array,
  cardId: string,
  size: keyof typeof THUMB_SIZES = 'main'
): Promise<string> {
  const dimensions = THUMB_SIZES[size];

  const processed = await convertToWebp(imageData, {
    width: dimensions.width,
    height: dimensions.height,
    quality: THUMBNAIL_QUALITY,
  });

  const path = `thumbs/${cardId}.webp`;

  // Store in R2 or local filesystem
  if (isCloudflareRuntime()) {
    const r2 = await getR2();
    if (!r2) throw new Error('R2 not available');
    await r2.put(path, processed.data, {
      httpMetadata: { contentType: 'image/webp' },
    });
  } else {
    const fs = await import('fs');
    const nodePath = await import('path');
    const uploadsDir = process.env.UPLOADS_DIR || nodePath.join(process.cwd(), 'uploads');
    const fullPath = nodePath.join(uploadsDir, path);

    // Ensure directory exists
    const dir = nodePath.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, Buffer.from(processed.data));
  }

  return path;
}

/**
 * Process embedded images from text content
 * Downloads, converts to WebP, stores in R2, returns URL mapping
 */
export async function processEmbeddedImages(
  text: string,
  cardId: string
): Promise<Map<string, string>> {
  const urlMapping = new Map<string, string>();
  const imageUrls = extractImageUrls(text);

  console.log(`[EmbeddedImages] Found ${imageUrls.length} image URLs in text for card ${cardId}`);
  if (imageUrls.length > 0) {
    console.log(`[EmbeddedImages] URLs:`, imageUrls.slice(0, 5)); // Log first 5
  }

  if (imageUrls.length === 0) return urlMapping;

  // Process in parallel with concurrency limit
  const CONCURRENCY = 5;
  const results: EmbeddedImageResult[] = [];

  for (let i = 0; i < imageUrls.length; i += CONCURRENCY) {
    const batch = imageUrls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (url): Promise<EmbeddedImageResult | null> => {
        try {
          const imageData = await downloadImage(url);
          if (!imageData) return null;

          // Convert to WebP
          const processed = await convertToWebp(imageData, {
            quality: EMBEDDED_QUALITY,
          });

          // Generate hash for filename
          const hash = hashContent(processed.data);
          const path = `images/${cardId}/${hash}.webp`;

          // Store in R2 or local filesystem
          if (isCloudflareRuntime()) {
            const r2 = await getR2();
            if (!r2) throw new Error('R2 not available');
            await r2.put(path, processed.data, {
              httpMetadata: { contentType: 'image/webp' },
            });
          } else {
            const fs = await import('fs');
            const nodePath = await import('path');
            const uploadsDir = process.env.UPLOADS_DIR || nodePath.join(process.cwd(), 'uploads');
            const fullPath = nodePath.join(uploadsDir, path);

            const dir = nodePath.dirname(fullPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, Buffer.from(processed.data));
          }

          return { originalUrl: url, newPath: path, hash };
        } catch (error) {
          console.error(`Failed to process embedded image ${url}:`, error);
          return null;
        }
      })
    );

    results.push(...batchResults.filter((r): r is EmbeddedImageResult => r !== null));
  }

  // Build URL mapping
  for (const result of results) {
    // Map original URL to our API path for serving
    urlMapping.set(result.originalUrl, `/api/uploads/${result.newPath}`);
  }

  return urlMapping;
}

/**
 * Rewrite image URLs in text content using the mapping
 */
export function rewriteImageUrls(text: string, urlMapping: Map<string, string>): string {
  let result = text;

  for (const [originalUrl, newUrl] of urlMapping) {
    // Escape special regex characters in the URL
    const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), newUrl);
  }

  return result;
}

/**
 * Process all images in card data and return modified data for display
 * Original data is never modified - this returns a new object
 */
export async function processCardImages(
  cardData: Record<string, unknown>,
  cardId: string
): Promise<{ displayData: Record<string, unknown>; urlMapping: Map<string, string> }> {
  console.log(`[ProcessCardImages] Starting for card ${cardId}`);
  const displayData = JSON.parse(JSON.stringify(cardData)); // Deep clone
  const allUrlMappings = new Map<string, string>();

  // Fields that may contain embedded images
  const fieldsToProcess = [
    'creator_notes',
    'creatorcomment',  // CCv2 field
    'description',
    'scenario',
    'first_mes',
    'mes_example',
    'system_prompt',
    'post_history_instructions',
  ];

  // Process data.* fields (CCv3 stores most content under data)
  const data = displayData.data as Record<string, unknown> | undefined;
  console.log(`[ProcessCardImages] Has data object: ${!!data}`);

  for (const field of fieldsToProcess) {
    // Check root level
    if (typeof displayData[field] === 'string' && displayData[field]) {
      console.log(`[ProcessCardImages] Processing root.${field} (${(displayData[field] as string).length} chars)`);
      const mapping = await processEmbeddedImages(displayData[field] as string, cardId);
      if (mapping.size > 0) {
        console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in root.${field}`);
        displayData[field] = rewriteImageUrls(displayData[field] as string, mapping);
        for (const [k, v] of mapping) allUrlMappings.set(k, v);
      }
    }

    // Check data.* level (CCv3)
    if (data && typeof data[field] === 'string' && data[field]) {
      console.log(`[ProcessCardImages] Processing data.${field} (${(data[field] as string).length} chars)`);
      const mapping = await processEmbeddedImages(data[field] as string, cardId);
      if (mapping.size > 0) {
        console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in data.${field}`);
        data[field] = rewriteImageUrls(data[field] as string, mapping);
        for (const [k, v] of mapping) allUrlMappings.set(k, v);
      }
    }
  }

  // Process alternate greetings
  const alternateGreetings = (data?.alternate_greetings ?? displayData.alternate_greetings) as string[] | undefined;
  console.log(`[ProcessCardImages] Alternate greetings count: ${alternateGreetings?.length ?? 0}`);
  if (Array.isArray(alternateGreetings)) {
    const target = data?.alternate_greetings ? data : displayData;
    const greetingsArray = target.alternate_greetings as string[];

    for (let i = 0; i < greetingsArray.length; i++) {
      if (typeof greetingsArray[i] === 'string') {
        console.log(`[ProcessCardImages] Processing greeting ${i} (${greetingsArray[i].length} chars)`);
        const mapping = await processEmbeddedImages(greetingsArray[i], cardId);
        if (mapping.size > 0) {
          console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in greeting ${i}`);
          greetingsArray[i] = rewriteImageUrls(greetingsArray[i], mapping);
          for (const [k, v] of mapping) allUrlMappings.set(k, v);
        }
      }
    }
  }

  console.log(`[ProcessCardImages] Total URLs rewritten: ${allUrlMappings.size}`);

  // Process character book / lorebook entries
  const characterBook = (data?.character_book ?? displayData.character_book) as Record<string, unknown> | undefined;
  if (characterBook?.entries && Array.isArray(characterBook.entries)) {
    for (const entry of characterBook.entries as Array<{ content?: string }>) {
      if (typeof entry.content === 'string') {
        const mapping = await processEmbeddedImages(entry.content, cardId);
        if (mapping.size > 0) {
          entry.content = rewriteImageUrls(entry.content, mapping);
          for (const [k, v] of mapping) allUrlMappings.set(k, v);
        }
      }
    }
  }

  return { displayData, urlMapping: allUrlMappings };
}
