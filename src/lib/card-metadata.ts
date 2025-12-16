/**
 * Shared card metadata utilities
 * Single source of truth for counting embedded images, greetings, etc.
 *
 * Related packages:
 * - @character-foundry/schemas: DerivedFeatures type, hasLorebook() function, deriveFeatures()
 * - @character-foundry/image-utils: Image URL extraction and counting
 * - @character-foundry/lorebook: Lorebook manipulation utilities
 * - @character-foundry/loader: validateClientMetadata() for server-side validation
 */

import { deriveFeatures } from '@character-foundry/character-foundry/schemas';
import { countImages } from '@character-foundry/character-foundry/image-utils';
import type { CCv3CharacterBook } from '@character-foundry/character-foundry/schemas';

/**
 * Count embedded images in text fields (markdown images, HTML images, data URIs)
 *
 * @deprecated Use countImages() from @character-foundry/image-utils instead
 */
export function countEmbeddedImages(texts: (string | undefined | null)[]): number {
  let count = 0;
  for (const text of texts) {
    if (!text) continue;
    count += countImages(text);
  }
  return count;
}

/**
 * Extract card metadata from card data
 * Use this for consistent metadata across client and server
 *
 * Note: This is a subset of DerivedFeatures from @character-foundry/schemas.
 * For full feature extraction including Risu extensions, depth prompts, etc.,
 * see the DerivedFeatures type and createEmptyFeatures() function.
 */
export interface CardMetadataCounts {
  hasAlternateGreetings: boolean;
  alternateGreetingsCount: number;
  /** Total greetings = first_mes (1) + alternate_greetings */
  totalGreetingsCount: number;
  hasLorebook: boolean;
  lorebookEntriesCount: number;
  hasEmbeddedImages: boolean;
  embeddedImagesCount: number;
}

export function extractCardMetadata(data: {
  description?: string | null;
  first_mes?: string | null;
  alternate_greetings?: (string | null)[] | null;
  mes_example?: string | null;
  creator_notes?: string | null;
  character_book?: CCv3CharacterBook | null;
  extensions?: Record<string, unknown>;
}): CardMetadataCounts {
  // Use canonical deriveFeatures() from @character-foundry/schemas
  const features = deriveFeatures(data as any);

  // Return subset matching CardMetadataCounts interface
  return {
    hasAlternateGreetings: features.hasAlternateGreetings,
    alternateGreetingsCount: features.alternateGreetingsCount,
    totalGreetingsCount: features.totalGreetingsCount,
    hasLorebook: features.hasLorebook,
    lorebookEntriesCount: features.lorebookEntriesCount,
    hasEmbeddedImages: features.hasEmbeddedImages,
    embeddedImagesCount: features.embeddedImagesCount,
  };
}
