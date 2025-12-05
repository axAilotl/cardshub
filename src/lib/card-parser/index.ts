import { detectSpec } from '@/lib/card-architect/schemas';
import { extractFromPNG, embedIntoPNG, isPNG } from '@/lib/card-architect/png';
import { extractCharx, type CharxData } from '@/lib/card-architect/charx';
import { extractVoxtaPackage, voxtaToCCv3, type VoxtaData } from '@/lib/card-architect/voxta';
import { toUint8Array, isZipBuffer } from '@/lib/card-architect/utils';
import type { ParsedCard, CharacterCard, CharacterCardV2, CharacterCardV3, SourceFormat } from '@/types/card';
import { countTokens } from './tokenizer';

/**
 * Extracted asset with binary data
 */
export interface ExtractedAsset {
  name: string;
  type: string; // 'icon', 'background', 'avatar', 'custom', etc.
  ext: string; // file extension
  buffer: Buffer;
  path?: string; // original path in the archive
}

/**
 * Extended parse result that includes extracted assets
 */
export interface ParseResultWithAssets {
  card: ParsedCard;
  extractedAssets: ExtractedAsset[];
  thumbnail?: Buffer; // Character thumbnail if available
  mainImage?: Buffer; // Main character image if available
}

/**
 * Parse a character card from any supported format
 * Supports: PNG, JSON, CharX (.charx), Voxta (.voxpkg)
 */
export function parseFromBuffer(buffer: Buffer, filename?: string): ParsedCard {
  const result = parseFromBufferWithAssets(buffer, filename);
  return result.card;
}

/**
 * Parse a character card and extract all binary assets
 * Returns the card plus all extracted assets with their buffers
 */
export function parseFromBufferWithAssets(buffer: Buffer, filename?: string): ParseResultWithAssets {
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

  // Check for PNG - return card with the PNG as main image
  if (isPNG(uint8)) {
    const card = parseFromPng(buffer);
    return {
      card,
      extractedAssets: [],
      mainImage: buffer,
    };
  }

  // Try as JSON - no assets
  const jsonString = buffer.toString('utf-8');
  const card = parseFromJson(jsonString);
  return {
    card,
    extractedAssets: [],
  };
}

/**
 * Parse CharX data and extract all assets
 */
function parseCharxWithAssets(charxData: CharxData): ParseResultWithAssets {
  const card = parseFromObject(charxData.card, 'charx');
  const extractedAssets: ExtractedAsset[] = [];
  let mainImage: Buffer | undefined;

  // Process all assets from the charx package
  for (const asset of charxData.assets) {
    // Skip if no buffer data
    if (!asset.buffer) continue;

    const assetBuffer = Buffer.from(asset.buffer);
    const fileName = asset.path.split('/').pop() || 'unknown';
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';

    // Determine asset type from descriptor or path
    const assetType = asset.descriptor?.type || 'custom';
    const assetName = asset.descriptor?.name || fileName;

    // Main character image (icon type) - separate from assets
    if (assetType === 'icon' && isImageExtension(fileExt)) {
      mainImage = assetBuffer;
      continue; // Don't add to extractedAssets
    }

    extractedAssets.push({
      name: assetName,
      type: assetType,
      ext: fileExt,
      buffer: assetBuffer,
      path: asset.path,
    });
  }

  return {
    card,
    extractedAssets,
    mainImage,
  };
}

/**
 * Parse Voxta data and extract all assets
 */
function parseVoxtaWithAssets(voxtaData: VoxtaData): ParseResultWithAssets {
  const character = voxtaData.characters[0];
  const ccv3 = voxtaToCCv3(character.data);
  const card = parseFromObject(ccv3, 'voxta');
  const extractedAssets: ExtractedAsset[] = [];

  // Get thumbnail/main image (BinaryData is Uint8Array) - NOT an asset
  let mainImage: Buffer | undefined;
  if (character.thumbnail) {
    mainImage = Buffer.from(character.thumbnail);
  }

  // Process other assets from the character (not the main image)
  for (const asset of character.assets) {
    const assetBuffer = Buffer.from(asset.buffer);
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

  return {
    card,
    extractedAssets,
    mainImage,
  };
}

/**
 * Check if extension is an image type
 */
function isImageExtension(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext.toLowerCase());
}

/**
 * Parse a character card from a PNG file buffer
 */
export function parseFromPng(buffer: Buffer): ParsedCard {
  const uint8 = toUint8Array(buffer);
  const result = extractFromPNG(uint8);

  if (!result) {
    throw new Error('No character card data found in PNG');
  }

  return parseFromObject(result.data, 'png');
}

/**
 * Parse a character card from a JSON string
 */
export function parseFromJson(jsonString: string): ParsedCard {
  let json: unknown;

  // Trim whitespace
  let cleanedJson = jsonString.trim();

  // Some cards have trailing garbage after valid JSON - try to extract just the JSON
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

  try {
    json = JSON.parse(cleanedJson);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`);
  }

  return parseFromObject(json, 'json');
}

/**
 * Parse a character card from a parsed JSON object
 */
export function parseFromObject(json: unknown, sourceFormat: SourceFormat = 'json'): ParsedCard {
  const spec = detectSpec(json);

  if (spec === 'v3') {
    return buildParsedCard(json as CharacterCardV3, 'v3', sourceFormat);
  } else if (spec === 'v2') {
    // Handle both wrapped and unwrapped v2 formats
    const card = normalizeV2Card(json);
    return buildParsedCard(card, 'v2', sourceFormat);
  } else {
    // Try to detect legacy format and upgrade to v2
    const card = tryParseLegacyCard(json);
    return buildParsedCard(card, 'v2', sourceFormat);
  }
}

/**
 * Normalize v2 card to wrapped format
 */
function normalizeV2Card(json: unknown): CharacterCardV2 {
  const obj = json as Record<string, unknown>;

  // Already wrapped format
  if (obj.spec === 'chara_card_v2' && obj.data) {
    return json as CharacterCardV2;
  }

  // Unwrapped format - wrap it
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: obj as CharacterCardV2['data'],
  };
}

/**
 * Try to parse a legacy card format (pre-v2) and convert to v2
 */
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

/**
 * Build a ParsedCard from a CharacterCard
 */
function buildParsedCard(card: CharacterCard, specVersion: 'v2' | 'v3', sourceFormat: SourceFormat): ParsedCard {
  const data = card.data;

  // Calculate token counts
  const tokens = {
    description: countTokens(data.description),
    personality: countTokens(data.personality),
    scenario: countTokens(data.scenario),
    mesExample: countTokens(data.mes_example),
    firstMes: countTokens(data.first_mes),
    systemPrompt: countTokens(data.system_prompt || ''),
    postHistory: countTokens(data.post_history_instructions || ''),
    total: 0,
  };
  tokens.total = Object.values(tokens).reduce((sum, count) => sum + count, 0);

  // Count embedded images in text fields
  const embeddedImages = countEmbeddedImages([
    data.description,
    data.first_mes,
    ...(data.alternate_greetings || []),
    data.mes_example,
    data.creator_notes || '',
  ]);

  // Build metadata
  const metadata = {
    hasAlternateGreetings: (data.alternate_greetings?.length || 0) > 0,
    alternateGreetingsCount: data.alternate_greetings?.length || 0,
    hasLorebook: !!data.character_book && data.character_book.entries.length > 0,
    lorebookEntriesCount: data.character_book?.entries.length || 0,
    hasEmbeddedImages: embeddedImages > 0,
    embeddedImagesCount: embeddedImages,
  };

  // Get assets for v3 cards
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

/**
 * Count embedded images in text (markdown and HTML img tags)
 */
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
 * Embed card data into a PNG buffer
 */
export function embedCardIntoPng(imageBuffer: Buffer, cardData: CharacterCard): Buffer {
  const uint8 = toUint8Array(imageBuffer);
  // Cast to any to bypass type mismatch between local and package types
  // The actual structure is compatible
  const result = embedIntoPNG(uint8, cardData as unknown as Parameters<typeof embedIntoPNG>[1]);
  return Buffer.from(result);
}

// Re-export utilities
export { countTokens, freeEncoder } from './tokenizer';
export { extractFromPNG, embedIntoPNG, isPNG } from '@/lib/card-architect/png';
export { extractCharx } from '@/lib/card-architect/charx';
export { extractVoxtaPackage, voxtaToCCv3 } from '@/lib/card-architect/voxta';
export { detectSpec } from '@/lib/card-architect/schemas';
