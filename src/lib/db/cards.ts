import { getDb, type CardRow, type CardVersionRow, type CardWithVersionRow, type TagRow, updateFtsIndex, removeFtsIndex } from './index';
import type { CardListItem, CardDetail, CardFilters, PaginatedResponse } from '@/types/card';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Get paginated list of cards with filtering
 * Now joins cards with card_versions via head_version_id
 */
export function getCards(filters: CardFilters = {}): PaginatedResponse<CardListItem> {
  const db = getDb();
  const {
    search,
    tags,
    excludeTags,
    sort = 'newest',
    page = 1,
    limit = 24,
    minTokens,
    maxTokens,
    hasAltGreetings,
    hasLorebook,
    hasEmbeddedImages,
    visibility = ['public'], // Default to public only
    includeNsfw = false,
  } = filters;

  const offset = (page - 1) * limit;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  // Visibility filter
  const allowedVisibility = includeNsfw
    ? ['public', 'nsfw_only']
    : visibility;
  if (allowedVisibility.length > 0) {
    const visPlaceholders = allowedVisibility.map(() => '?').join(', ');
    conditions.push(`c.visibility IN (${visPlaceholders})`);
    params.push(...allowedVisibility);
  }

  // Only show cards that are not blocked by moderation
  conditions.push(`c.moderation_state != 'blocked'`);

  // Search condition using FTS5 for better results
  let useFts = false;
  let ftsQuery = '';
  if (search && search.trim()) {
    const searchTerm = search.trim();
    // Use FTS5 for multi-word searches or when search term is longer
    if (searchTerm.length >= 2) {
      useFts = true;
      // Escape special FTS5 characters and create prefix search
      ftsQuery = searchTerm
        .replace(/[\"\']/g, '') // Remove quotes
        .split(/\s+/)
        .filter(word => word.length >= 2)
        .map(word => `"${word}"*`) // Prefix match each word
        .join(' ');

      if (ftsQuery) {
        conditions.push(`c.id IN (SELECT card_id FROM cards_fts WHERE cards_fts MATCH ?)`);
        params.push(ftsQuery);
      } else {
        // Fallback to LIKE for very short terms
        useFts = false;
      }
    }

    if (!useFts) {
      // Fallback to LIKE search
      conditions.push('(c.name LIKE ? OR c.description LIKE ? OR c.creator LIKE ?)');
      const likeTerm = `%${searchTerm}%`;
      params.push(likeTerm, likeTerm, likeTerm);
    }
  }

  // Include tags filter
  if (tags && tags.length > 0) {
    const tagPlaceholders = tags.map(() => '?').join(', ');
    conditions.push(`c.id IN (
      SELECT ct.card_id FROM card_tags ct
      JOIN tags t ON ct.tag_id = t.id
      WHERE t.slug IN (${tagPlaceholders})
      GROUP BY ct.card_id
      HAVING COUNT(DISTINCT t.slug) = ?
    )`);
    params.push(...tags, tags.length);
  }

  // Exclude tags filter
  if (excludeTags && excludeTags.length > 0) {
    const excludeTagPlaceholders = excludeTags.map(() => '?').join(', ');
    conditions.push(`c.id NOT IN (
      SELECT ct.card_id FROM card_tags ct
      JOIN tags t ON ct.tag_id = t.id
      WHERE t.slug IN (${excludeTagPlaceholders})
    )`);
    params.push(...excludeTags);
  }

  // Token filters (now on version)
  if (minTokens !== undefined && minTokens > 0) {
    conditions.push('v.tokens_total >= ?');
    params.push(minTokens);
  }
  if (maxTokens !== undefined && maxTokens > 0) {
    conditions.push('v.tokens_total <= ?');
    params.push(maxTokens);
  }

  // Feature filters (now on version)
  if (hasAltGreetings) {
    conditions.push('v.has_alt_greetings = 1');
  }
  if (hasLorebook) {
    conditions.push('v.has_lorebook = 1');
  }
  if (hasEmbeddedImages) {
    conditions.push('v.has_embedded_images = 1');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort order
  let orderBy: string;
  switch (sort) {
    case 'oldest':
      orderBy = 'c.created_at ASC';
      break;
    case 'popular':
      orderBy = '(c.upvotes - c.downvotes) DESC, c.created_at DESC';
      break;
    case 'trending':
      // Trending = recent + popular weighted by recency
      orderBy = '((c.upvotes - c.downvotes) + (c.downloads_count / 10) + (c.favorites_count / 5)) * (1.0 / (1 + ((unixepoch() - c.created_at) / 86400))) DESC';
      break;
    case 'downloads':
      orderBy = 'c.downloads_count DESC, c.created_at DESC';
      break;
    case 'favorites':
      orderBy = 'c.favorites_count DESC, c.created_at DESC';
      break;
    case 'newest':
    default:
      orderBy = 'c.created_at DESC';
  }

  // Count total (with JOIN)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM cards c
    LEFT JOIN card_versions v ON c.head_version_id = v.id
    ${whereClause}
  `;
  const totalResult = db.prepare(countQuery).get(...params) as { total: number };
  const total = totalResult.total;

  // Get cards with version data
  const query = `
    SELECT
      c.id, c.slug, c.name, c.description, c.creator, c.creator_notes,
      c.visibility, c.moderation_state,
      c.upvotes, c.downvotes, c.favorites_count, c.downloads_count, c.comments_count, c.forks_count,
      c.uploader_id, c.created_at, c.updated_at,
      v.id as version_id,
      v.spec_version, v.source_format, v.storage_url,
      v.has_assets, v.assets_count,
      v.image_path, v.thumbnail_path, v.tokens_total,
      v.has_alt_greetings, v.alt_greetings_count, v.has_lorebook, v.lorebook_entries_count,
      v.has_embedded_images, v.embedded_images_count,
      u.username as uploader_username, u.display_name as uploader_display_name
    FROM cards c
    LEFT JOIN card_versions v ON c.head_version_id = v.id
    LEFT JOIN users u ON c.uploader_id = u.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  const rows = db.prepare(query).all(...params) as (CardWithVersionRow & {
    uploader_username?: string;
    uploader_display_name?: string;
  })[];

  // Get tags for each card
  const cardIds = rows.map((r) => r.id);
  const tagsMap = getTagsForCards(cardIds);

  const items: CardListItem[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    creator: row.creator,
    creatorNotes: row.creator_notes,
    specVersion: row.spec_version,
    sourceFormat: (row.source_format || 'png') as CardListItem['sourceFormat'],
    hasAssets: row.has_assets === 1,
    assetsCount: row.assets_count || 0,
    imagePath: row.image_path,
    thumbnailPath: row.thumbnail_path,
    tokensTotal: row.tokens_total,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    favoritesCount: row.favorites_count,
    downloadsCount: row.downloads_count,
    commentsCount: row.comments_count,
    forksCount: row.forks_count,
    hasAlternateGreetings: row.has_alt_greetings === 1,
    alternateGreetingsCount: row.alt_greetings_count,
    hasLorebook: row.has_lorebook === 1,
    lorebookEntriesCount: row.lorebook_entries_count,
    hasEmbeddedImages: row.has_embedded_images === 1,
    embeddedImagesCount: row.embedded_images_count,
    visibility: row.visibility,
    tags: tagsMap.get(row.id) || [],
    uploader: row.uploader_id
      ? {
          id: row.uploader_id,
          username: row.uploader_username || '',
          displayName: row.uploader_display_name || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total,
  };
}

/**
 * Get a single card by slug (with head version)
 */
export function getCardBySlug(slug: string): CardDetail | null {
  const db = getDb();

  const query = `
    SELECT
      c.*,
      v.id as version_id,
      v.storage_url, v.content_hash, v.spec_version, v.source_format,
      v.tokens_description, v.tokens_personality, v.tokens_scenario,
      v.tokens_mes_example, v.tokens_first_mes, v.tokens_system_prompt,
      v.tokens_post_history, v.tokens_total,
      v.has_alt_greetings, v.alt_greetings_count, v.has_lorebook, v.lorebook_entries_count,
      v.has_embedded_images, v.embedded_images_count,
      v.has_assets, v.assets_count, v.saved_assets,
      v.image_path, v.image_width, v.image_height,
      v.thumbnail_path, v.thumbnail_width, v.thumbnail_height,
      v.card_data,
      v.forked_from_id as forked_from_version_id,
      v.created_at as version_created_at,
      u.username as uploader_username, u.display_name as uploader_display_name
    FROM cards c
    LEFT JOIN card_versions v ON c.head_version_id = v.id
    LEFT JOIN users u ON c.uploader_id = u.id
    WHERE c.slug = ?
  `;

  const row = db.prepare(query).get(slug) as (CardWithVersionRow & {
    uploader_username?: string;
    uploader_display_name?: string;
  }) | undefined;

  if (!row) return null;

  const tags = getTagsForCards([row.id]).get(row.id) || [];
  const cardData = row.card_data ? JSON.parse(row.card_data) : {};
  const savedAssets = row.saved_assets ? JSON.parse(row.saved_assets) : null;

  // Get fork source info if forked
  let forkedFrom = null;
  if (row.forked_from_version_id) {
    const forkSource = db.prepare(`
      SELECT c.id, c.slug, c.name, cv.id as version_id
      FROM card_versions cv
      JOIN cards c ON cv.card_id = c.id
      WHERE cv.id = ?
    `).get(row.forked_from_version_id) as { id: string; slug: string; name: string; version_id: string } | undefined;

    if (forkSource) {
      forkedFrom = {
        id: forkSource.id,
        slug: forkSource.slug,
        name: forkSource.name,
        versionId: forkSource.version_id,
      };
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    creator: row.creator,
    creatorNotes: row.creator_notes,
    specVersion: row.spec_version,
    sourceFormat: (row.source_format || 'png') as CardDetail['sourceFormat'],
    hasAssets: row.has_assets === 1,
    assetsCount: row.assets_count || 0,
    imagePath: row.image_path,
    thumbnailPath: row.thumbnail_path,
    tokensTotal: row.tokens_total,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    favoritesCount: row.favorites_count,
    downloadsCount: row.downloads_count,
    commentsCount: row.comments_count,
    forksCount: row.forks_count,
    hasAlternateGreetings: row.has_alt_greetings === 1,
    alternateGreetingsCount: row.alt_greetings_count,
    hasLorebook: row.has_lorebook === 1,
    lorebookEntriesCount: row.lorebook_entries_count,
    hasEmbeddedImages: row.has_embedded_images === 1,
    embeddedImagesCount: row.embedded_images_count,
    visibility: row.visibility,
    tags,
    uploader: row.uploader_id
      ? {
          id: row.uploader_id,
          username: row.uploader_username || '',
          displayName: row.uploader_display_name || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokens: {
      description: row.tokens_description,
      personality: row.tokens_personality,
      scenario: row.tokens_scenario,
      mesExample: row.tokens_mes_example,
      firstMes: row.tokens_first_mes,
      systemPrompt: row.tokens_system_prompt,
      postHistory: row.tokens_post_history,
      total: row.tokens_total,
    },
    cardData,
    savedAssets,
    forkedFrom,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    // Version info
    versionId: row.version_id,
    storageUrl: row.storage_url,
    contentHash: row.content_hash,
  };
}

/**
 * Get tags for a list of card IDs
 */
function getTagsForCards(cardIds: string[]): Map<string, { id: number; name: string; slug: string; category: string | null }[]> {
  if (cardIds.length === 0) return new Map();

  const db = getDb();
  const placeholders = cardIds.map(() => '?').join(', ');

  const query = `
    SELECT ct.card_id, t.id, t.name, t.slug, t.category
    FROM card_tags ct
    JOIN tags t ON ct.tag_id = t.id
    WHERE ct.card_id IN (${placeholders})
  `;

  const rows = db.prepare(query).all(...cardIds) as {
    card_id: string;
    id: number;
    name: string;
    slug: string;
    category: string | null;
  }[];

  const result = new Map<string, { id: number; name: string; slug: string; category: string | null }[]>();

  for (const row of rows) {
    if (!result.has(row.card_id)) {
      result.set(row.card_id, []);
    }
    result.get(row.card_id)!.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
    });
  }

  return result;
}

/**
 * Get all tags grouped by category
 */
export function getAllTags(): { category: string; tags: TagRow[] }[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, name, slug, category, usage_count
    FROM tags
    ORDER BY category, usage_count DESC, name
  `).all() as TagRow[];

  const grouped = new Map<string, TagRow[]>();

  for (const row of rows) {
    const category = row.category || 'other';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(row);
  }

  return Array.from(grouped.entries()).map(([category, tags]) => ({
    category,
    tags,
  }));
}

/**
 * Input for creating a new card with its initial version
 */
export interface CreateCardInput {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  creatorNotes: string | null;
  uploaderId: string | null;
  visibility?: 'public' | 'nsfw_only' | 'unlisted';
  tagSlugs: string[];
  // Version-specific data
  version: {
    storageUrl: string;
    contentHash: string;
    specVersion: string;
    sourceFormat: string;
    tokens: {
      description: number;
      personality: number;
      scenario: number;
      mesExample: number;
      firstMes: number;
      systemPrompt: number;
      postHistory: number;
      total: number;
    };
    hasAltGreetings: boolean;
    altGreetingsCount: number;
    hasLorebook: boolean;
    lorebookEntriesCount: number;
    hasEmbeddedImages: boolean;
    embeddedImagesCount: number;
    hasAssets: boolean;
    assetsCount: number;
    savedAssets: string | null;
    imagePath: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    thumbnailPath: string | null;
    thumbnailWidth: number | null;
    thumbnailHeight: number | null;
    cardData: string;
    forkedFromVersionId?: string | null;
  };
}

/**
 * Create a new card with its initial version
 */
export function createCard(input: CreateCardInput): { cardId: string; versionId: string } {
  const db = getDb();
  const versionId = nanoid();

  db.transaction(() => {
    // Insert card identity
    db.prepare(`
      INSERT INTO cards (
        id, slug, name, description, creator, creator_notes,
        head_version_id, visibility, uploader_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.slug,
      input.name,
      input.description,
      input.creator,
      input.creatorNotes,
      versionId, // Set head to this version
      input.visibility || 'public',
      input.uploaderId
    );

    // Insert initial version
    db.prepare(`
      INSERT INTO card_versions (
        id, card_id, storage_url, content_hash, spec_version, source_format,
        tokens_description, tokens_personality, tokens_scenario,
        tokens_mes_example, tokens_first_mes, tokens_system_prompt,
        tokens_post_history, tokens_total,
        has_alt_greetings, alt_greetings_count,
        has_lorebook, lorebook_entries_count,
        has_embedded_images, embedded_images_count,
        has_assets, assets_count, saved_assets,
        image_path, image_width, image_height,
        thumbnail_path, thumbnail_width, thumbnail_height,
        card_data, forked_from_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `).run(
      versionId,
      input.id,
      input.version.storageUrl,
      input.version.contentHash,
      input.version.specVersion,
      input.version.sourceFormat,
      input.version.tokens.description,
      input.version.tokens.personality,
      input.version.tokens.scenario,
      input.version.tokens.mesExample,
      input.version.tokens.firstMes,
      input.version.tokens.systemPrompt,
      input.version.tokens.postHistory,
      input.version.tokens.total,
      input.version.hasAltGreetings ? 1 : 0,
      input.version.altGreetingsCount,
      input.version.hasLorebook ? 1 : 0,
      input.version.lorebookEntriesCount,
      input.version.hasEmbeddedImages ? 1 : 0,
      input.version.embeddedImagesCount,
      input.version.hasAssets ? 1 : 0,
      input.version.assetsCount,
      input.version.savedAssets,
      input.version.imagePath,
      input.version.imageWidth,
      input.version.imageHeight,
      input.version.thumbnailPath,
      input.version.thumbnailWidth,
      input.version.thumbnailHeight,
      input.version.cardData,
      input.version.forkedFromVersionId || null
    );

    // If this is a fork, increment the source card's fork count
    if (input.version.forkedFromVersionId) {
      db.prepare(`
        UPDATE cards SET forks_count = forks_count + 1
        WHERE id = (SELECT card_id FROM card_versions WHERE id = ?)
      `).run(input.version.forkedFromVersionId);
    }

    // Link tags - create them if they don't exist
    if (input.tagSlugs.length > 0) {
      const findTag = db.prepare('SELECT id FROM tags WHERE slug = ?');
      const createTag = db.prepare('INSERT INTO tags (name, slug, category, usage_count) VALUES (?, ?, ?, 0)');
      const tagInsert = db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)');
      const tagUpdate = db.prepare('UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?');

      for (const tag of input.tagSlugs) {
        const slug = tag.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!slug) continue;

        // Find or create the tag
        let tagRow = findTag.get(slug) as { id: number } | undefined;
        if (!tagRow) {
          // Create new tag with original name (title case)
          const name = tag.trim();
          createTag.run(name, slug, null);
          tagRow = findTag.get(slug) as { id: number };
        }

        if (tagRow) {
          tagInsert.run(input.id, tagRow.id);
          tagUpdate.run(tagRow.id);
        }
      }
    }
  })();

  // Update FTS index (outside transaction for better error handling)
  updateFtsIndex(input.id, input.name, input.description, input.creator, input.creatorNotes);

  return { cardId: input.id, versionId };
}

/**
 * Create a new version for an existing card (edit)
 */
export interface CreateVersionInput {
  cardId: string;
  storageUrl: string;
  contentHash: string;
  specVersion: string;
  sourceFormat: string;
  tokens: {
    description: number;
    personality: number;
    scenario: number;
    mesExample: number;
    firstMes: number;
    systemPrompt: number;
    postHistory: number;
    total: number;
  };
  hasAltGreetings: boolean;
  altGreetingsCount: number;
  hasLorebook: boolean;
  lorebookEntriesCount: number;
  hasEmbeddedImages: boolean;
  embeddedImagesCount: number;
  hasAssets: boolean;
  assetsCount: number;
  savedAssets: string | null;
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  cardData: string;
}

export function createVersion(input: CreateVersionInput): string {
  const db = getDb();
  const versionId = nanoid();

  db.transaction(() => {
    // Get current head version
    const card = db.prepare('SELECT head_version_id FROM cards WHERE id = ?').get(input.cardId) as { head_version_id: string | null } | undefined;
    const parentVersionId = card?.head_version_id || null;

    // Insert new version
    db.prepare(`
      INSERT INTO card_versions (
        id, card_id, parent_version_id, storage_url, content_hash, spec_version, source_format,
        tokens_description, tokens_personality, tokens_scenario,
        tokens_mes_example, tokens_first_mes, tokens_system_prompt,
        tokens_post_history, tokens_total,
        has_alt_greetings, alt_greetings_count,
        has_lorebook, lorebook_entries_count,
        has_embedded_images, embedded_images_count,
        has_assets, assets_count, saved_assets,
        image_path, image_width, image_height,
        thumbnail_path, thumbnail_width, thumbnail_height,
        card_data
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?
      )
    `).run(
      versionId,
      input.cardId,
      parentVersionId,
      input.storageUrl,
      input.contentHash,
      input.specVersion,
      input.sourceFormat,
      input.tokens.description,
      input.tokens.personality,
      input.tokens.scenario,
      input.tokens.mesExample,
      input.tokens.firstMes,
      input.tokens.systemPrompt,
      input.tokens.postHistory,
      input.tokens.total,
      input.hasAltGreetings ? 1 : 0,
      input.altGreetingsCount,
      input.hasLorebook ? 1 : 0,
      input.lorebookEntriesCount,
      input.hasEmbeddedImages ? 1 : 0,
      input.embeddedImagesCount,
      input.hasAssets ? 1 : 0,
      input.assetsCount,
      input.savedAssets,
      input.imagePath,
      input.imageWidth,
      input.imageHeight,
      input.thumbnailPath,
      input.thumbnailWidth,
      input.thumbnailHeight,
      input.cardData
    );

    // Update card's head version
    db.prepare('UPDATE cards SET head_version_id = ?, updated_at = unixepoch() WHERE id = ?').run(versionId, input.cardId);
  })();

  return versionId;
}

/**
 * Get version history for a card
 */
export function getCardVersions(cardId: string): CardVersionRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM card_versions
    WHERE card_id = ?
    ORDER BY created_at DESC
  `).all(cardId) as CardVersionRow[];
}

/**
 * Get a single card version by ID
 */
export function getCardVersionById(versionId: string): CardVersionRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM card_versions WHERE id = ?').get(versionId);
  return (row as CardVersionRow) || null;
}

/**
 * Increment download count
 */
export function incrementDownloads(cardId: string): void {
  const db = getDb();
  db.prepare('UPDATE cards SET downloads_count = downloads_count + 1 WHERE id = ?').run(cardId);
}

/**
 * Get all valid tag slugs for filtering auto-extracted tags
 */
export function getValidTagSlugs(): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT slug FROM tags').all() as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
}

/**
 * Delete a card and its associated data
 */
export function deleteCard(cardId: string): void {
  const db = getDb();

  // Remove from FTS index before deleting the card
  removeFtsIndex(cardId);

  db.transaction(() => {
    // Decrement tag usage counts
    const tagSlugs = db.prepare(`
      SELECT t.slug FROM card_tags ct
      JOIN tags t ON ct.tag_id = t.id
      WHERE ct.card_id = ?
    `).all(cardId) as { slug: string }[];

    const tagUpdate = db.prepare('UPDATE tags SET usage_count = MAX(0, usage_count - 1) WHERE slug = ?');
    for (const { slug } of tagSlugs) {
      tagUpdate.run(slug);
    }

    // Delete card_tags
    db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);

    // Delete votes
    db.prepare('DELETE FROM votes WHERE card_id = ?').run(cardId);

    // Delete favorites
    db.prepare('DELETE FROM favorites WHERE card_id = ?').run(cardId);

    // Delete downloads
    db.prepare('DELETE FROM downloads WHERE card_id = ?').run(cardId);

    // Delete comments
    db.prepare('DELETE FROM comments WHERE card_id = ?').run(cardId);

    // Delete reports
    db.prepare('DELETE FROM reports WHERE card_id = ?').run(cardId);

    // Delete versions (cascades via FK, but explicit for safety)
    db.prepare('DELETE FROM card_versions WHERE card_id = ?').run(cardId);

    // Delete the card itself
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
  })();
}

/**
 * Vote on a card
 */
export function voteOnCard(userId: string, cardId: string, vote: 1 | -1): void {
  const db = getDb();

  db.transaction(() => {
    // Check for existing vote
    const existing = db.prepare('SELECT vote FROM votes WHERE user_id = ? AND card_id = ?').get(userId, cardId) as { vote: number } | undefined;

    if (existing) {
      if (existing.vote === vote) {
        // Same vote - remove it
        db.prepare('DELETE FROM votes WHERE user_id = ? AND card_id = ?').run(userId, cardId);
        if (vote === 1) {
          db.prepare('UPDATE cards SET upvotes = upvotes - 1 WHERE id = ?').run(cardId);
        } else {
          db.prepare('UPDATE cards SET downvotes = downvotes - 1 WHERE id = ?').run(cardId);
        }
      } else {
        // Different vote - update it
        db.prepare('UPDATE votes SET vote = ?, created_at = unixepoch() WHERE user_id = ? AND card_id = ?').run(vote, userId, cardId);
        if (vote === 1) {
          db.prepare('UPDATE cards SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE id = ?').run(cardId);
        } else {
          db.prepare('UPDATE cards SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = ?').run(cardId);
        }
      }
    } else {
      // New vote
      db.prepare('INSERT INTO votes (user_id, card_id, vote) VALUES (?, ?, ?)').run(userId, cardId, vote);
      if (vote === 1) {
        db.prepare('UPDATE cards SET upvotes = upvotes + 1 WHERE id = ?').run(cardId);
      } else {
        db.prepare('UPDATE cards SET downvotes = downvotes + 1 WHERE id = ?').run(cardId);
      }
    }
  })();
}

/**
 * Get user's vote on a card
 */
export function getUserVote(userId: string, cardId: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT vote FROM votes WHERE user_id = ? AND card_id = ?').get(userId, cardId) as { vote: number } | undefined;
  return row?.vote || null;
}

/**
 * Toggle favorite on a card
 */
export function toggleFavorite(userId: string, cardId: string): boolean {
  const db = getDb();
  let isFavorited = false;

  db.transaction(() => {
    const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND card_id = ?').get(userId, cardId);

    if (existing) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND card_id = ?').run(userId, cardId);
      db.prepare('UPDATE cards SET favorites_count = favorites_count - 1 WHERE id = ?').run(cardId);
      isFavorited = false;
    } else {
      db.prepare('INSERT INTO favorites (user_id, card_id) VALUES (?, ?)').run(userId, cardId);
      db.prepare('UPDATE cards SET favorites_count = favorites_count + 1 WHERE id = ?').run(cardId);
      isFavorited = true;
    }
  })();

  return isFavorited;
}

/**
 * Check if user has favorited a card
 */
export function isFavorited(userId: string, cardId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND card_id = ?').get(userId, cardId);
  return !!row;
}

/**
 * Get user's favorites
 */
export function getUserFavorites(userId: string): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT card_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId) as { card_id: string }[];
  return rows.map(r => r.card_id);
}

/**
 * Add a comment to a card
 */
export function addComment(cardId: string, userId: string, content: string, parentId?: string): string {
  const db = getDb();
  const commentId = nanoid();

  db.transaction(() => {
    db.prepare('INSERT INTO comments (id, card_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)').run(
      commentId,
      cardId,
      userId,
      parentId || null,
      content
    );
    db.prepare('UPDATE cards SET comments_count = comments_count + 1 WHERE id = ?').run(cardId);
  })();

  return commentId;
}

/**
 * Get comments for a card
 */
export function getComments(cardId: string): {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  parentId: string | null;
  content: string;
  createdAt: number;
}[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.id, c.user_id, c.parent_id, c.content, c.created_at,
           u.username, u.display_name
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.card_id = ?
    ORDER BY c.created_at ASC
  `).all(cardId) as {
    id: string;
    user_id: string;
    parent_id: string | null;
    content: string;
    created_at: number;
    username: string;
    display_name: string | null;
  }[];

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    parentId: r.parent_id,
    content: r.content,
    createdAt: r.created_at,
  }));
}

/**
 * Report a card
 */
export function reportCard(cardId: string, reporterId: string, reason: string, details?: string): void {
  const db = getDb();

  db.transaction(() => {
    db.prepare('INSERT INTO reports (card_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)').run(
      cardId,
      reporterId,
      reason,
      details || null
    );

    // If card has too many pending reports, flag for review
    const reportCount = db.prepare(`
      SELECT COUNT(*) as count FROM reports WHERE card_id = ? AND status = 'pending'
    `).get(cardId) as { count: number };

    if (reportCount.count >= 3) {
      db.prepare(`UPDATE cards SET moderation_state = 'review' WHERE id = ?`).run(cardId);
    }
  })();
}

/**
 * Update card visibility (admin only)
 */
export function updateCardVisibility(cardId: string, visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked'): void {
  const db = getDb();
  db.prepare('UPDATE cards SET visibility = ?, updated_at = unixepoch() WHERE id = ?').run(visibility, cardId);
}

/**
 * Update card moderation state (admin only)
 */
export function updateModerationState(cardId: string, state: 'ok' | 'review' | 'blocked'): void {
  const db = getDb();
  db.prepare('UPDATE cards SET moderation_state = ?, updated_at = unixepoch() WHERE id = ?').run(state, cardId);
}

/**
 * Compute content hash for a buffer
 */
export function computeContentHash(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}
