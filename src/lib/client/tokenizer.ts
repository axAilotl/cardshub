/**
 * Client-side tokenizer using gpt-tokenizer (pure JS, browser-compatible)
 * Uses cl100k_base encoding (GPT-4/3.5-turbo compatible)
 */
import { encode } from 'gpt-tokenizer';

/**
 * Count tokens in a string using gpt-tokenizer
 */
export function countTokens(text: string): number {
  if (!text || text.trim() === '') {
    return 0;
  }

  try {
    const tokens = encode(text);
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

export interface TokenCounts {
  description: number;
  personality: number;
  scenario: number;
  mesExample: number;
  firstMes: number;
  systemPrompt: number;
  postHistory: number;
  total: number;
}

/**
 * Count tokens for all card fields
 */
export function countCardTokens(data: {
  description?: string;
  personality?: string;
  scenario?: string;
  mes_example?: string;
  first_mes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
}): TokenCounts {
  const tokens: TokenCounts = {
    description: countTokens(data.description || ''),
    personality: countTokens(data.personality || ''),
    scenario: countTokens(data.scenario || ''),
    mesExample: countTokens(data.mes_example || ''),
    firstMes: countTokens(data.first_mes || ''),
    systemPrompt: countTokens(data.system_prompt || ''),
    postHistory: countTokens(data.post_history_instructions || ''),
    total: 0,
  };

  tokens.total = tokens.description + tokens.personality + tokens.scenario +
    tokens.mesExample + tokens.firstMes + tokens.systemPrompt + tokens.postHistory;

  return tokens;
}
