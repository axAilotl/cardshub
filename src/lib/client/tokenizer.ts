/**
 * Client-side tokenizer backed by Character Foundry tokenizers.
 * Browser-compatible (pure JS) with cl100k_base (GPT-4/3.5-turbo compatible) as default.
 */
import { getTokenizer } from '@character-foundry/character-foundry/tokenizers';

const DEFAULT_TOKENIZER_ID = 'gpt-4';
const defaultTokenizer = getTokenizer(DEFAULT_TOKENIZER_ID);

/**
 * Count tokens in a string using Character Foundry tokenizers
 */
export function countTokens(text: string): number {
  if (!text || text.trim() === '') {
    return 0;
  }

  return defaultTokenizer.count(text);
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
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  mes_example?: string | null;
  first_mes?: string | null;
  system_prompt?: string | null;
  post_history_instructions?: string | null;
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
