/**
 * @card-architect/charx
 *
 * CHARX format reading and writing for character cards.
 * Works in both Node.js and browser environments.
 */

// Reader exports
export {
  type CharxExtractionOptions,
  type AssetFetcher,
  extractCharx,
  extractCardJsonOnly,
  extractCharxAsync,
} from './reader';

// Writer exports
export {
  type CharxWriteAsset,
  type CharxBuildOptions,
  type CharxBuildResult,
  buildCharx,
  buildCharxAsync,
} from './writer';

// Validator exports
export {
  validateCharx,
  validateCharxBuild,
  normalizeAssetOrder,
  deduplicateAssetNames,
} from './validator';

// Re-export types from schemas for convenience
export type {
  CharxData,
  CharxAssetInfo,
  CharxMetadata,
  CharxValidationResult,
} from '@/lib/card-architect/schemas';
