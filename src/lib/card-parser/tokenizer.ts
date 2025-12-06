// Tiktoken is dynamically imported to avoid crashes on Cloudflare Workers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let encoder: any = null;
let tiktokenModule: typeof import('tiktoken') | null = null;

/**
 * Count tokens in a string using tiktoken (or fallback estimate)
 */
export function countTokens(text: string): number {
  if (!text || text.trim() === '') {
    return 0;
  }

  // On Cloudflare Workers, tiktoken won't work - use fallback
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis && !process?.env?.DATABASE_PATH) {
    return Math.ceil(text.length / 4);
  }

  try {
    // Lazy load tiktoken on first use (Node.js only)
    if (!tiktokenModule) {
      // Use eval to hide from bundler
      // eslint-disable-next-line no-eval
      const dynamicRequire = eval('require');
      tiktokenModule = dynamicRequire('tiktoken');
    }

    if (!encoder && tiktokenModule) {
      encoder = tiktokenModule.get_encoding('cl100k_base');
    }

    if (encoder) {
      const tokens = encoder.encode(text);
      return tokens.length;
    }

    return Math.ceil(text.length / 4);
  } catch (error) {
    console.error('Error counting tokens:', error);
    // Fallback to rough estimate
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for multiple fields
 */
export function countFieldTokens(fields: Record<string, string | undefined>): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [key, value] of Object.entries(fields)) {
    result[key] = countTokens(value || '');
  }

  return result;
}

/**
 * Get total token count from token breakdown
 */
export function getTotalTokens(tokens: Record<string, number>): number {
  return Object.values(tokens).reduce((sum, count) => sum + count, 0);
}

/**
 * Free the encoder to release memory
 * Call this when done with batch processing
 */
export function freeEncoder(): void {
  if (encoder && typeof encoder.free === 'function') {
    encoder.free();
    encoder = null;
  }
}
