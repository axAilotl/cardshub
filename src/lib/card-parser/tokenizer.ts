import { get_encoding, type Tiktoken } from 'tiktoken';

// Use cl100k_base encoding (GPT-4/3.5-turbo)
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  return encoder;
}

/**
 * Count tokens in a string using tiktoken
 */
export function countTokens(text: string): number {
  if (!text || text.trim() === '') {
    return 0;
  }

  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
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
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
