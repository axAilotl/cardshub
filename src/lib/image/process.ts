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
import { isImageCacheEnabled } from '@/lib/db/settings';
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
 * Handles markdown images, HTML images (quoted and unquoted), CSS url(), and data URIs
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];

  // Markdown images: ![alt](url)
  const markdownPattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownPattern.exec(text)) !== null) {
    urls.push(match[1].trim());
  }

  // HTML images with quoted src: <img src="url"> or <img src='url'>
  const htmlQuotedPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlQuotedPattern.exec(text)) !== null) {
    urls.push(match[1].trim());
  }

  // HTML images with unquoted src: <img src=url ...> (URL ends at space or >)
  const htmlUnquotedPattern = /<img[^>]+src=([^\s"'>]+)[^>]*>/gi;
  while ((match = htmlUnquotedPattern.exec(text)) !== null) {
    // Skip if it starts with a quote (already handled above)
    const url = match[1].trim();
    if (!url.startsWith('"') && !url.startsWith("'")) {
      urls.push(url);
    }
  }

  // CSS url() function: url(url), url("url"), url('url')
  // Common in background-image, background, content, etc.
  const cssUrlPattern = /url\(["']?([^)"']+)["']?\)/gi;
  while ((match = cssUrlPattern.exec(text)) !== null) {
    const url = match[1].trim();
    // Only include http(s) URLs, not relative paths or data URIs (handled separately)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urls.push(url);
    }
  }

  // Plain image URLs in text (common image hosting domains and file extensions)
  // This catches URLs that aren't wrapped in img tags or markdown
  const plainUrlPattern = /(?<![("'])(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp))(?![)"'])/gi;
  while ((match = plainUrlPattern.exec(text)) !== null) {
    urls.push(match[1].trim());
  }

  // Data URIs (these need to be converted too)
  const dataUriPattern = /(data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+)/g;
  while ((match = dataUriPattern.exec(text)) !== null) {
    urls.push(match[1]);
  }

  return [...new Set(urls)]; // Dedupe
}

// Maximum image size to download (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
// Download timeout (10 seconds)
const DOWNLOAD_TIMEOUT_MS = 10000;

/**
 * Check if a hostname is an internal/private address (SSRF protection)
 */
function isInternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block localhost variants
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true;
  }

  // Block AWS metadata endpoint
  if (lower === '169.254.169.254') {
    return true;
  }

  // Block private IP ranges
  const privateRanges = [
    /^10\./,                          // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12
    /^192\.168\./,                    // 192.168.0.0/16
    /^127\./,                         // 127.0.0.0/8
    /^169\.254\./,                    // Link-local
    /^fc[0-9a-f]{2}:/i,              // IPv6 unique local
    /^fe80:/i,                        // IPv6 link-local
  ];

  for (const range of privateRanges) {
    if (range.test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Download an image from a URL with SSRF protections
 * If we get a 302 redirect (often hotlink protection), retry with no Referer
 */
async function downloadImage(url: string): Promise<Uint8Array | null> {
  try {
    // Handle data URIs (max 5MB for inline data)
    if (url.startsWith('data:image/')) {
      const base64Match = url.match(/base64,(.+)$/);
      if (base64Match) {
        const base64Data = base64Match[1];
        if (base64Data.length > 7 * 1024 * 1024) { // ~5MB after decode
          console.error(`[EmbeddedImages] Data URI too large`);
          return null;
        }
        return Uint8Array.from(Buffer.from(base64Data, 'base64'));
      }
      console.error(`[EmbeddedImages] Invalid data URI format`);
      return null;
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      console.error(`[EmbeddedImages] Invalid URL: ${url}`);
      return null;
    }

    // Only allow HTTP(S)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.error(`[EmbeddedImages] Invalid protocol: ${parsed.protocol}`);
      return null;
    }

    // Block internal/private addresses (SSRF protection)
    if (isInternalHost(parsed.hostname)) {
      console.error(`[EmbeddedImages] Blocked internal address: ${parsed.hostname}`);
      return null;
    }

    // Try to download, with retry on 302 (hotlink protection redirect)
    const result = await tryDownloadWithRetry(url, parsed);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[EmbeddedImages] Download timeout: ${url}`);
    } else {
      console.error(`[EmbeddedImages] Error downloading ${url}:`, error);
    }
    return null;
  }
}

/**
 * Attempt download with retry on 302 redirect
 */
async function tryDownloadWithRetry(url: string, parsed: URL): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    // First attempt: check for redirect without following
    const checkResponse = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': parsed.origin + '/',
      },
      redirect: 'manual', // Don't follow redirects automatically
    });

    // If 302/301, this might be hotlink protection - retry without Referer
    if (checkResponse.status === 301 || checkResponse.status === 302) {
      console.log(`[EmbeddedImages] Got ${checkResponse.status} for ${url}, retrying without Referer`);

      const retryResponse = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          // No Referer - some hotlink protection blocks wrong referers
        },
        redirect: 'follow',
      });

      if (!retryResponse.ok) {
        console.error(`[EmbeddedImages] Retry failed for ${url} - ${retryResponse.status}`);
        return null;
      }

      return await extractImageData(retryResponse, url);
    }

    // Not a redirect - follow through with normal response
    if (!checkResponse.ok) {
      console.error(`[EmbeddedImages] Failed to download: ${url} - ${checkResponse.status}`);
      return null;
    }

    return await extractImageData(checkResponse, url);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract image data from response with size checks
 */
async function extractImageData(response: Response, url: string): Promise<Uint8Array | null> {
  // Check content-length header if available
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_IMAGE_SIZE) {
    console.error(`[EmbeddedImages] Image too large (${contentLength} bytes): ${url}`);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();

  // Final size check (in case content-length was missing or wrong)
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    console.error(`[EmbeddedImages] Downloaded image too large (${arrayBuffer.byteLength} bytes): ${url}`);
    return null;
  }

  return new Uint8Array(arrayBuffer);
}

/**
 * Convert image to WebP using Sharp (Node.js)
 * If maxPixels is provided, resize to fit within that pixel budget while preserving aspect ratio
 */
async function convertWithSharp(
  data: Uint8Array,
  options: { width?: number; height?: number; quality: number; maxPixels?: number }
): Promise<ProcessedImage> {
  const { default: sharp } = await import('sharp');

  let pipeline = sharp(Buffer.from(data));

  if (options.maxPixels) {
    // Get original dimensions to calculate target size
    const metadata = await sharp(Buffer.from(data)).metadata();
    if (metadata.width && metadata.height) {
      const currentPixels = metadata.width * metadata.height;
      if (currentPixels > options.maxPixels) {
        // Calculate scale factor to fit within maxPixels
        const scale = Math.sqrt(options.maxPixels / currentPixels);
        const targetWidth = Math.round(metadata.width * scale);
        const targetHeight = Math.round(metadata.height * scale);
        pipeline = pipeline.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
    }
  } else if (options.width && options.height) {
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
 * For maxPixels, we approximate with max dimension (sqrt of maxPixels)
 */
async function convertWithImagesBinding(
  data: Uint8Array,
  options: { width?: number; height?: number; quality: number; maxPixels?: number }
): Promise<ProcessedImage> {
  const images = await getImages();
  if (!images) {
    throw new Error('IMAGES binding not available');
  }

  let stream = images.input(data.buffer as ArrayBuffer);

  if (options.maxPixels) {
    // Approximate max dimension from pixel budget
    // For 1MP, max ~1000px; for 2MP, max ~1414px
    const maxDim = Math.round(Math.sqrt(options.maxPixels));
    stream = stream.transform({
      width: maxDim,
      height: maxDim,
      fit: 'scale-down', // Preserve aspect ratio, only shrink
    });
  } else if (options.width && options.height) {
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
 * maxPixels: limit total pixels (e.g., 1_000_000 for 1MP, 2_000_000 for 2MP)
 */
export async function convertToWebp(
  data: Uint8Array,
  options: { width?: number; height?: number; quality?: number; maxPixels?: number } = {}
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

// Max pixels for embedded preview images
const MAX_PIXELS_GREETINGS = 1_000_000;  // 1MP (~1000x1000)
const MAX_PIXELS_NOTES = 2_000_000;      // 2MP (~1414x1414)

/**
 * Process embedded images from text content
 * Downloads, converts to WebP (resized to maxPixels), stores in R2, returns URL mapping
 * @param maxPixels - Max total pixels for resizing (default 2MP for creator notes)
 */
export async function processEmbeddedImages(
  text: string,
  cardId: string,
  maxPixels: number = MAX_PIXELS_NOTES
): Promise<Map<string, string>> {
  const urlMapping = new Map<string, string>();
  const imageUrls = extractImageUrls(text);

  console.log(`[EmbeddedImages] Found ${imageUrls.length} image URLs in text for card ${cardId} (max ${maxPixels / 1_000_000}MP)`);
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

          // Convert to WebP with size limit
          const processed = await convertToWebp(imageData, {
            quality: EMBEDDED_QUALITY,
            maxPixels,
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
 *
 * Can be disabled via admin settings (image_cache_enabled)
 */
export async function processCardImages(
  cardData: Record<string, unknown>,
  cardId: string
): Promise<{ displayData: Record<string, unknown>; urlMapping: Map<string, string> }> {
  console.log(`[ProcessCardImages] Starting for card ${cardId}`);

  // Check if image caching is enabled
  const cacheEnabled = await isImageCacheEnabled();
  if (!cacheEnabled) {
    console.log(`[ProcessCardImages] Image caching is disabled, skipping`);
    return {
      displayData: JSON.parse(JSON.stringify(cardData)),
      urlMapping: new Map<string, string>(),
    };
  }

  console.log(`[ProcessCardImages] Card data keys:`, Object.keys(cardData));
  const displayData = JSON.parse(JSON.stringify(cardData)); // Deep clone
  const allUrlMappings = new Map<string, string>();

  // Fields that may contain embedded images (use 2MP for creator-facing content)
  const notesFields = [
    'creator_notes',
    'creatorcomment',  // CCv2 field
    'description',
    'scenario',
    'mes_example',
    'system_prompt',
    'post_history_instructions',
  ];

  // Greeting fields use smaller 1MP limit (displayed more often, benefits from smaller files)
  const greetingFields = ['first_mes'];

  // Process data.* fields (CCv3 stores most content under data)
  const data = displayData.data as Record<string, unknown> | undefined;
  console.log(`[ProcessCardImages] Has data object: ${!!data}`);
  if (data) {
    console.log(`[ProcessCardImages] Data keys:`, Object.keys(data));
  }

  // Helper to process a field at root or data level
  const processField = async (field: string, maxPixels: number) => {
    // Check root level
    if (typeof displayData[field] === 'string' && displayData[field]) {
      console.log(`[ProcessCardImages] Processing root.${field} (${(displayData[field] as string).length} chars, ${maxPixels / 1_000_000}MP)`);
      const mapping = await processEmbeddedImages(displayData[field] as string, cardId, maxPixels);
      if (mapping.size > 0) {
        console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in root.${field}`);
        displayData[field] = rewriteImageUrls(displayData[field] as string, mapping);
        for (const [k, v] of mapping) allUrlMappings.set(k, v);
      }
    }

    // Check data.* level (CCv3)
    if (data && typeof data[field] === 'string' && data[field]) {
      console.log(`[ProcessCardImages] Processing data.${field} (${(data[field] as string).length} chars, ${maxPixels / 1_000_000}MP)`);
      const mapping = await processEmbeddedImages(data[field] as string, cardId, maxPixels);
      if (mapping.size > 0) {
        console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in data.${field}`);
        data[field] = rewriteImageUrls(data[field] as string, mapping);
        for (const [k, v] of mapping) allUrlMappings.set(k, v);
      }
    }
  };

  // Process notes/description fields at 2MP
  for (const field of notesFields) {
    await processField(field, MAX_PIXELS_NOTES);
  }

  // Process greeting fields at 1MP
  for (const field of greetingFields) {
    await processField(field, MAX_PIXELS_GREETINGS);
  }

  // Process alternate greetings at 1MP
  const alternateGreetings = (data?.alternate_greetings ?? displayData.alternate_greetings) as string[] | undefined;
  console.log(`[ProcessCardImages] Alternate greetings count: ${alternateGreetings?.length ?? 0}`);
  if (Array.isArray(alternateGreetings)) {
    const target = data?.alternate_greetings ? data : displayData;
    const greetingsArray = target.alternate_greetings as string[];

    for (let i = 0; i < greetingsArray.length; i++) {
      if (typeof greetingsArray[i] === 'string') {
        console.log(`[ProcessCardImages] Processing greeting ${i} (${greetingsArray[i].length} chars, 1MP)`);
        const mapping = await processEmbeddedImages(greetingsArray[i], cardId, MAX_PIXELS_GREETINGS);
        if (mapping.size > 0) {
          console.log(`[ProcessCardImages] Rewriting ${mapping.size} URLs in greeting ${i}`);
          greetingsArray[i] = rewriteImageUrls(greetingsArray[i], mapping);
          for (const [k, v] of mapping) allUrlMappings.set(k, v);
        }
      }
    }
  }

  console.log(`[ProcessCardImages] Total URLs rewritten from text fields: ${allUrlMappings.size}`);

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
