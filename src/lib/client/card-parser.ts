import { detectSpec } from '@/lib/card-architect/schemas';
import { extractFromPNG, isPNG } from '@/lib/card-architect/png';
import { extractCharx, type CharxData } from '@/lib/card-architect/charx';
import { extractVoxtaPackage, voxtaToCCv3, type VoxtaData } from '@/lib/card-architect/voxta';
import { toUint8Array, isZipBuffer } from '@/lib/card-architect/utils';
import { countCardTokens, type TokenCounts } from './tokenizer';

export interface CharacterCardV2Data {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  character_book?: {
    entries: Array<{
      keys: string[];
      content: string;
      extensions: Record<string, unknown>;
      enabled: boolean;
      insertion_order: number;
      case_sensitive?: boolean;
      name?: string;
      priority?: number;
      id?: number;
      comment?: string;
      selective?: boolean;
      secondary_keys?: string[];
      constant?: boolean;
      position?: string;
    }>;
    name?: string;
    description?: string;
    scan_depth?: number;
    token_budget?: number;
    recursive_scanning?: boolean;
    extensions?: Record<string, unknown>;
  };
  extensions?: Record<string, unknown>;
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: string;
  data: CharacterCardV2Data;
}

export interface CharacterCardV3 {
  spec: 'chara_card_v3';
  spec_version: string;
  data: CharacterCardV2Data & {
    assets?: Array<{
      type: string;
      uri: string;
      name: string;
      ext: string;
    }>;
  };
}

export type CharacterCard = CharacterCardV2 | CharacterCardV3;

export type SourceFormat = 'png' | 'json' | 'charx' | 'voxta';

export interface CardMetadata {
  hasAlternateGreetings: boolean;
  alternateGreetingsCount: number;
  hasLorebook: boolean;
  lorebookEntriesCount: number;
  hasEmbeddedImages: boolean;
  embeddedImagesCount: number;
}

export interface ParsedCard {
  raw: CharacterCard;
  specVersion: 'v2' | 'v3';
  sourceFormat: SourceFormat;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  messageExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  tokens: TokenCounts;
  metadata: CardMetadata;
  lorebook?: CharacterCardV2Data['character_book'];
  assets?: CharacterCardV3['data']['assets'];
}

export interface ExtractedAsset {
  name: string;
  type: string;
  ext: string;
  buffer: Uint8Array;
  path?: string;
}

export interface ParseResultWithAssets {
  card: ParsedCard;
  extractedAssets: ExtractedAsset[];
  mainImage?: Uint8Array;
}

/**
 * Parse a character card from any supported format (client-side)
 */
export function parseFromBuffer(buffer: Uint8Array, filename?: string): ParsedCard {
  const result = parseFromBufferWithAssets(buffer, filename);
  return result.card;
}

/**
 * Parse a character card and extract all binary assets
 */
export function parseFromBufferWithAssets(buffer: Uint8Array, filename?: string): ParseResultWithAssets {
  const uint8 = toUint8Array(buffer);
  const ext = filename?.split('.').pop()?.toLowerCase();

  // Check for CharX (ZIP with card.json)
  if (ext === 'charx' || (isZipBuffer(uint8) && !ext)) {
    try {
      const charxData = extractCharx(uint8);
      return parseCharxWithAssets(charxData);
    } catch {
      // Not a valid CharX, try other formats
    }
  }

  // Check for Voxta package
  if (ext === 'voxpkg') {
    const voxtaData = extractVoxtaPackage(uint8);
    if (voxtaData.characters.length > 0) {
      return parseVoxtaWithAssets(voxtaData);
    }
    throw new Error('Voxta package contains no characters');
  }

  // Check for PNG
  if (isPNG(uint8)) {
    const card = parseFromPng(uint8);
    return {
      card,
      extractedAssets: [],
      mainImage: uint8,
    };
  }

  // Try as JSON
  const decoder = new TextDecoder('utf-8');
  const jsonString = decoder.decode(uint8);
  const card = parseFromJson(jsonString);
  return {
    card,
    extractedAssets: [],
  };
}

function parseCharxWithAssets(charxData: CharxData): ParseResultWithAssets {
  const card = parseFromObject(charxData.card, 'charx');
  const extractedAssets: ExtractedAsset[] = [];
  let mainImage: Uint8Array | undefined;

  for (const asset of charxData.assets) {
    if (!asset.buffer) continue;

    const assetBuffer = new Uint8Array(asset.buffer);
    const fileName = asset.path.split('/').pop() || 'unknown';
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const assetType = asset.descriptor?.type || 'custom';
    const assetName = asset.descriptor?.name || fileName;

    if (assetType === 'icon' && isImageExtension(fileExt)) {
      mainImage = assetBuffer;
      continue;
    }

    extractedAssets.push({
      name: assetName,
      type: assetType,
      ext: fileExt,
      buffer: assetBuffer,
      path: asset.path,
    });
  }

  return { card, extractedAssets, mainImage };
}

function parseVoxtaWithAssets(voxtaData: VoxtaData): ParseResultWithAssets {
  const character = voxtaData.characters[0];
  const ccv3 = voxtaToCCv3(character.data);
  const card = parseFromObject(ccv3, 'voxta');
  const extractedAssets: ExtractedAsset[] = [];

  let mainImage: Uint8Array | undefined;
  if (character.thumbnail) {
    mainImage = new Uint8Array(character.thumbnail);
  }

  for (const asset of character.assets) {
    const assetBuffer = new Uint8Array(asset.buffer);
    const fileName = asset.path.split('/').pop() || 'unknown';
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';

    extractedAssets.push({
      name: fileName,
      type: 'custom',
      ext: fileExt,
      buffer: assetBuffer,
      path: asset.path,
    });
  }

  return { card, extractedAssets, mainImage };
}

function isImageExtension(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext.toLowerCase());
}

export function parseFromPng(buffer: Uint8Array): ParsedCard {
  const uint8 = toUint8Array(buffer);
  const result = extractFromPNG(uint8);

  if (!result) {
    throw new Error('No character card data found in PNG');
  }

  return parseFromObject(result.data, 'png');
}

export function parseFromJson(jsonString: string): ParsedCard {
  let cleanedJson = jsonString.trim();

  // Handle trailing garbage after valid JSON
  if (cleanedJson.startsWith('{')) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;

    for (let i = 0; i < cleanedJson.length; i++) {
      const char = cleanedJson[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1 && endIndex < cleanedJson.length - 1) {
      cleanedJson = cleanedJson.slice(0, endIndex + 1);
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(cleanedJson);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`);
  }

  return parseFromObject(json, 'json');
}

export function parseFromObject(json: unknown, sourceFormat: SourceFormat = 'json'): ParsedCard {
  const spec = detectSpec(json);

  if (spec === 'v3') {
    return buildParsedCard(json as CharacterCardV3, 'v3', sourceFormat);
  } else if (spec === 'v2') {
    const card = normalizeV2Card(json);
    return buildParsedCard(card, 'v2', sourceFormat);
  } else {
    const card = tryParseLegacyCard(json);
    return buildParsedCard(card, 'v2', sourceFormat);
  }
}

function normalizeV2Card(json: unknown): CharacterCardV2 {
  const obj = json as Record<string, unknown>;

  if (obj.spec === 'chara_card_v2' && obj.data) {
    return json as CharacterCardV2;
  }

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: obj as unknown as CharacterCardV2Data,
  };
}

function tryParseLegacyCard(json: unknown): CharacterCardV2 {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid card: not an object');
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.name !== 'string') {
    throw new Error('Invalid card: missing name field');
  }

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: obj.name as string,
      description: typeof obj.description === 'string' ? obj.description : '',
      personality: typeof obj.personality === 'string' ? obj.personality : '',
      scenario: typeof obj.scenario === 'string' ? obj.scenario : '',
      first_mes: typeof obj.first_mes === 'string' ? obj.first_mes :
                 typeof obj.greeting === 'string' ? obj.greeting : '',
      mes_example: typeof obj.mes_example === 'string' ? obj.mes_example :
                   typeof obj.example_dialogue === 'string' ? obj.example_dialogue : '',
      creator_notes: typeof obj.creator_notes === 'string' ? obj.creator_notes : undefined,
      system_prompt: typeof obj.system_prompt === 'string' ? obj.system_prompt : undefined,
      post_history_instructions: typeof obj.post_history_instructions === 'string' ? obj.post_history_instructions : undefined,
      alternate_greetings: Array.isArray(obj.alternate_greetings)
        ? obj.alternate_greetings.filter((g): g is string => typeof g === 'string')
        : undefined,
      tags: Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
      creator: typeof obj.creator === 'string' ? obj.creator : undefined,
      character_version: typeof obj.character_version === 'string' ? obj.character_version : undefined,
    },
  };
}

function buildParsedCard(card: CharacterCard, specVersion: 'v2' | 'v3', sourceFormat: SourceFormat): ParsedCard {
  const data = card.data;

  // Calculate token counts using client-side tokenizer
  const tokens = countCardTokens(data);

  // Count embedded images
  const embeddedImages = countEmbeddedImages([
    data.description,
    data.first_mes,
    ...(data.alternate_greetings || []),
    data.mes_example,
    data.creator_notes || '',
  ]);

  const metadata: CardMetadata = {
    hasAlternateGreetings: (data.alternate_greetings?.length || 0) > 0,
    alternateGreetingsCount: data.alternate_greetings?.length || 0,
    hasLorebook: !!data.character_book && data.character_book.entries.length > 0,
    lorebookEntriesCount: data.character_book?.entries.length || 0,
    hasEmbeddedImages: embeddedImages > 0,
    embeddedImagesCount: embeddedImages,
  };

  const assets = specVersion === 'v3' ? (card as CharacterCardV3).data.assets : undefined;

  return {
    raw: card,
    specVersion,
    sourceFormat,
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMessage: data.first_mes,
    messageExample: data.mes_example,
    creatorNotes: data.creator_notes || '',
    systemPrompt: data.system_prompt || '',
    postHistoryInstructions: data.post_history_instructions || '',
    alternateGreetings: data.alternate_greetings || [],
    tags: data.tags || [],
    creator: data.creator || '',
    characterVersion: data.character_version || '',
    tokens,
    metadata,
    lorebook: data.character_book,
    assets,
  };
}

function countEmbeddedImages(texts: string[]): number {
  let count = 0;

  const patterns = [
    /!\[.*?\]\(.*?\)/g,
    /<img[^>]+src=["'][^"']+["'][^>]*>/gi,
    /data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g,
  ];

  for (const text of texts) {
    if (!text) continue;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
  }

  return count;
}

/**
 * Compute SHA-256 hash of a buffer (browser-compatible)
 * Falls back to a simple hash if crypto.subtle is not available (non-HTTPS)
 */
export async function computeContentHash(buffer: Uint8Array): Promise<string> {
  // crypto.subtle only available in secure contexts (HTTPS or localhost)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
      const copy = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(copy).set(buffer);
      const hashBuffer = await crypto.subtle.digest('SHA-256', copy);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: simple hash for non-secure contexts (development)
  // Uses djb2 algorithm - not cryptographically secure but sufficient for dedup
  let hash = 5381;
  for (let i = 0; i < buffer.length; i++) {
    hash = ((hash << 5) + hash) ^ buffer[i];
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  // Add length and sample bytes for better uniqueness
  const sample = [
    buffer[0] || 0,
    buffer[Math.floor(buffer.length / 4)] || 0,
    buffer[Math.floor(buffer.length / 2)] || 0,
    buffer[Math.floor(buffer.length * 3 / 4)] || 0,
    buffer[buffer.length - 1] || 0,
  ];
  return `fallback-${hash.toString(16)}-${buffer.length}-${sample.map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
