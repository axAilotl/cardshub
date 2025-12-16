/**
 * Image Proxy Endpoint
 *
 * Proxies external images to bypass hotlink protection and enable caching.
 * This is used when displaying images in Creator's Notes and Greetings that
 * might be blocked due to Referer/Origin checks by the source server.
 *
 * Usage: GET /api/proxy/image?url=<encoded-url>
 *
 * Can be disabled via admin settings (image_proxy_enabled)
 */

import { NextRequest, NextResponse } from 'next/server';
import { isImageProxyEnabled } from '@/lib/db/settings';
import { isURLSafe } from '@character-foundry/character-foundry/image-utils';

// Maximum image size to proxy (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
// Proxy timeout (15 seconds)
const PROXY_TIMEOUT_MS = 15000;
// Cache duration - kept short since proxy is a fallback (upload-time caching is preferred)
const CACHE_BROWSER_SECONDS = 300;  // 5 minutes
const CACHE_CDN_SECONDS = 900;      // 15 minutes

// Allowed image content types
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
];

export async function GET(request: NextRequest) {
  // Check if proxy is enabled
  const proxyEnabled = await isImageProxyEnabled();
  if (!proxyEnabled) {
    return NextResponse.json(
      { error: 'Image proxy is disabled' },
      { status: 503 }
    );
  }

  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate and parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Only allow HTTP(S)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
  }

  // Block internal/private addresses (SSRF protection using canonical implementation)
  const safetyCheck = isURLSafe(url);
  if (!safetyCheck.safe) {
    return NextResponse.json(
      { error: `SSRF risk: ${safetyCheck.reason}` },
      { status: 403 }
    );
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        // Set Referer to the origin to bypass hotlink protection
        'Referer': parsed.origin + '/',
      },
      // Follow redirects
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[ImageProxy] Failed to fetch ${url}: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    // Check content type
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      console.error(`[ImageProxy] Invalid content type: ${contentType}`);
      return NextResponse.json({ error: 'Not an image' }, { status: 400 });
    }

    // Check content length if available
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_SIZE) {
      console.error(`[ImageProxy] Image too large: ${contentLength}`);
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Stream the response body
    const arrayBuffer = await response.arrayBuffer();

    // Final size check
    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
      console.error(`[ImageProxy] Downloaded image too large: ${arrayBuffer.byteLength}`);
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Return with cache headers
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': arrayBuffer.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_BROWSER_SECONDS}, s-maxage=${CACHE_CDN_SECONDS}, stale-while-revalidate=86400`,
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        // Allow cross-origin access for images
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[ImageProxy] Timeout fetching ${url}`);
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    }

    console.error(`[ImageProxy] Error fetching ${url}:`, error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  }
}
