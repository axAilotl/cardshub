/**
 * Collections database operations
 */

import { getDatabase } from './async-db';
import { generateSlug } from '../utils';
import type {
  Collection,
  CollectionListItem,
  CollectionDetail,
  CreateCollectionInput,
  CollectionFilters,
} from '@/types/collection';
import type { CardListItem, PaginatedResponse } from '@/types/card';

let cachedCollectionsFtsAvailable = false;
async function isCollectionsFtsAvailableAsync(db: Awaited<ReturnType<typeof getDatabase>>): Promise<boolean> {
  if (cachedCollectionsFtsAvailable) return true;

  try {
    const row = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'collections_fts' LIMIT 1`)
      .get<{ sql: string }>();
    const available = !!row?.sql && /fts5/i.test(row.sql);
    if (available) cachedCollectionsFtsAvailable = true;
    return available;
  } catch {
    return false;
  }
}

/**
 * Get a collection by slug
 */
export async function getCollectionBySlug(slug: string): Promise<CollectionDetail | null> {
  const db = await getDatabase();

  const row = await db.prepare(`
    SELECT
      c.*,
      u.id as uploader_id,
      u.username as uploader_username,
      u.display_name as uploader_display_name
    FROM collections c
    LEFT JOIN users u ON c.uploader_id = u.id
    WHERE c.slug = ?
  `).get(slug) as Record<string, unknown> | undefined;

  if (!row) return null;

  // Get child cards - use simpler query that works with minimal columns
  const cards = await db.prepare(`
    SELECT
      cards.id,
      cards.slug,
      cards.name,
      cards.description,
      cards.creator,
      cards.creator_notes,
      cards.visibility,
      cards.upvotes,
      cards.downvotes,
      cards.favorites_count,
      cards.downloads_count,
      cards.comments_count,
      cards.forks_count,
      cards.uploader_id,
      cards.created_at,
      cards.updated_at,
      cards.head_version_id,
      COALESCE(cv.spec_version, 'v2') as spec_version,
      COALESCE(cv.source_format, 'png') as source_format,
      COALESCE(cv.tokens_total, 0) as tokens_total,
      COALESCE(cv.has_alt_greetings, 0) as has_alt_greetings,
      COALESCE(cv.alt_greetings_count, 0) as alt_greetings_count,
      COALESCE(cv.has_lorebook, 0) as has_lorebook,
      COALESCE(cv.lorebook_entries_count, 0) as lorebook_entries_count,
      COALESCE(cv.has_embedded_images, 0) as has_embedded_images,
      COALESCE(cv.embedded_images_count, 0) as embedded_images_count,
      COALESCE(cv.has_assets, 0) as has_assets,
      COALESCE(cv.assets_count, 0) as assets_count,
      cv.image_path,
      cv.thumbnail_path,
      u.username as uploader_username,
      u.display_name as uploader_display_name
    FROM cards
    LEFT JOIN card_versions cv ON cards.head_version_id = cv.id
    LEFT JOIN users u ON cards.uploader_id = u.id
    WHERE cards.collection_id = ?
    ORDER BY cards.created_at ASC
  `).all(row.id as string) as Record<string, unknown>[];

  // Get tags for all child cards
  const cardIds = cards.map(c => c.id as string);
  let cardTags: Record<string, unknown>[] = [];
  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',');
    cardTags = await db.prepare(`
      SELECT ct.card_id, t.id, t.name, t.slug, t.category
      FROM card_tags ct
      JOIN tags t ON ct.tag_id = t.id
      WHERE ct.card_id IN (${placeholders})
    `).all(...cardIds) as Record<string, unknown>[];
  }

  // Group tags by card
  const tagsByCard = new Map<string, { id: number; name: string; slug: string; category: string | null }[]>();
  for (const tag of cardTags) {
    const cardId = tag.card_id as string;
    if (!tagsByCard.has(cardId)) {
      tagsByCard.set(cardId, []);
    }
    tagsByCard.get(cardId)!.push({
      id: tag.id as number,
      name: tag.name as string,
      slug: tag.slug as string,
      category: tag.category as string | null,
    });
  }

  // Aggregate all tags from children
  const allTags = new Set<string>();
  for (const tags of tagsByCard.values()) {
    for (const tag of tags) {
      allTags.add(tag.slug);
    }
  }

  // Map cards to CardListItem
  const items: CardListItem[] = cards.map(card => ({
    id: card.id as string,
    slug: card.slug as string,
    name: card.name as string,
    description: card.description as string | null,
    creator: card.creator as string | null,
    creatorNotes: card.creator_notes as string | null,
    specVersion: card.spec_version as string,
    sourceFormat: card.source_format as 'png' | 'json' | 'charx' | 'voxta',
    hasAssets: !!card.has_assets,
    assetsCount: card.assets_count as number || 0,
    imagePath: card.image_path as string | null,
    thumbnailPath: card.thumbnail_path as string | null,
    tokensTotal: card.tokens_total as number || 0,
    upvotes: card.upvotes as number || 0,
    downvotes: card.downvotes as number || 0,
    score: (card.upvotes as number || 0) - (card.downvotes as number || 0),
    favoritesCount: card.favorites_count as number || 0,
    downloadsCount: card.downloads_count as number || 0,
    commentsCount: card.comments_count as number || 0,
    forksCount: card.forks_count as number || 0,
    visibility: card.visibility as 'public' | 'nsfw_only' | 'unlisted' | 'blocked',
    hasAlternateGreetings: !!card.has_alt_greetings,
    alternateGreetingsCount: card.alt_greetings_count as number || 0,
    totalGreetingsCount: 1 + (card.alt_greetings_count as number || 0),
    hasLorebook: !!card.has_lorebook,
    lorebookEntriesCount: card.lorebook_entries_count as number || 0,
    hasEmbeddedImages: !!card.has_embedded_images,
    embeddedImagesCount: card.embedded_images_count as number || 0,
    tags: tagsByCard.get(card.id as string) || [],
    uploader: card.uploader_id ? {
      id: card.uploader_id as string,
      username: card.uploader_username as string,
      displayName: card.uploader_display_name as string | null,
    } : null,
    createdAt: card.created_at as number,
    updatedAt: card.updated_at as number,
    collectionId: row.id as string,
    collectionSlug: row.slug as string,
    collectionName: row.name as string,
  }));

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string | null,
    creator: row.creator as string | null,
    explicitContent: !!(row.explicit_content as number),
    packageId: row.package_id as string | null,
    packageVersion: row.package_version as string | null,
    entryResourceKind: row.entry_resource_kind as number | null,
    entryResourceId: row.entry_resource_id as string | null,
    thumbnailResourceKind: row.thumbnail_resource_kind as number | null,
    thumbnailResourceId: row.thumbnail_resource_id as string | null,
    dateCreated: row.date_created as string | null,
    dateModified: row.date_modified as string | null,
    storageUrl: row.storage_url as string,
    thumbnailPath: row.thumbnail_path as string | null,
    thumbnailWidth: row.thumbnail_width as number | null,
    thumbnailHeight: row.thumbnail_height as number | null,
    uploaderId: row.uploader_id as string,
    visibility: row.visibility as 'public' | 'nsfw_only' | 'unlisted' | 'blocked',
    itemsCount: row.items_count as number,
    downloadsCount: row.downloads_count as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    uploader: {
      id: row.uploader_id as string,
      username: row.uploader_username as string,
      displayName: row.uploader_display_name as string | null,
    },
    items,
    tags: Array.from(allTags),
  };
}

/**
 * Get a collection by package ID (for upgrade detection)
 */
export async function getCollectionByPackageId(packageId: string): Promise<Collection | null> {
  const db = await getDatabase();

  const row = await db.prepare(`
    SELECT * FROM collections WHERE package_id = ?
  `).get(packageId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return mapRowToCollection(row);
}

/**
 * List collections with filtering and pagination
 */
export async function getCollections(
  filters: CollectionFilters = {}
): Promise<PaginatedResponse<CollectionListItem>> {
  const db = await getDatabase();

  const {
    page = 1,
    limit = 20,
    sort = 'newest',
    includeNsfw = false,
    uploaderId,
  } = filters;

  const offset = (page - 1) * limit;
  const params: unknown[] = [];

  // Build WHERE clause
  const whereClauses: string[] = ["c.visibility != 'blocked'"];

  if (!includeNsfw) {
    whereClauses.push("c.visibility != 'nsfw_only'");
    whereClauses.push('c.explicit_content = 0');
  }

  if (uploaderId) {
    whereClauses.push('c.uploader_id = ?');
    params.push(uploaderId);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Build ORDER BY
  let orderBy: string;
  switch (sort) {
    case 'downloads':
      orderBy = 'c.downloads_count DESC';
      break;
    case 'items':
      orderBy = 'c.items_count DESC';
      break;
    case 'newest':
    default:
      orderBy = 'c.created_at DESC';
  }

  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as count FROM collections c ${whereClause}
  `).get(...params) as { count: number };

  const total = countResult.count;

  // Get items
  const rows = await db.prepare(`
    SELECT
      c.*,
      u.id as uploader_id,
      u.username as uploader_username,
      u.display_name as uploader_display_name
    FROM collections c
    LEFT JOIN users u ON c.uploader_id = u.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, unknown>[];

  const items: CollectionListItem[] = rows.map(row => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string | null,
    creator: row.creator as string | null,
    explicitContent: !!(row.explicit_content as number),
    thumbnailPath: row.thumbnail_path as string | null,
    thumbnailWidth: row.thumbnail_width as number | null,
    thumbnailHeight: row.thumbnail_height as number | null,
    itemsCount: row.items_count as number,
    downloadsCount: row.downloads_count as number,
    visibility: row.visibility as string,
    createdAt: row.created_at as number,
    uploader: {
      id: row.uploader_id as string,
      username: row.uploader_username as string,
      displayName: row.uploader_display_name as string | null,
    },
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
 * Create a new collection
 */
export async function createCollection(input: CreateCollectionInput): Promise<string> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);

  await db.prepare(`
    INSERT INTO collections (
      id, slug, name, description, creator, explicit_content,
      package_id, package_version,
      entry_resource_kind, entry_resource_id,
      thumbnail_resource_kind, thumbnail_resource_id,
      date_created, date_modified,
      storage_url, thumbnail_path, thumbnail_width, thumbnail_height,
      uploader_id, visibility, items_count, downloads_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    input.id,
    input.slug,
    input.name,
    input.description,
    input.creator,
    input.explicitContent ? 1 : 0,
    input.packageId,
    input.packageVersion,
    input.entryResourceKind,
    input.entryResourceId,
    input.thumbnailResourceKind,
    input.thumbnailResourceId,
    input.dateCreated,
    input.dateModified,
    input.storageUrl,
    input.thumbnailPath,
    input.thumbnailWidth,
    input.thumbnailHeight,
    input.uploaderId,
    input.visibility,
    input.itemsCount,
    now,
    now
  );

  // Add to FTS index (optional)
  try {
    const ftsAvailable = await isCollectionsFtsAvailableAsync(db);
    if (ftsAvailable) {
      await db.prepare(`
        INSERT INTO collections_fts (collection_id, name, description, creator)
        VALUES (?, ?, ?, ?)
      `).run(
        input.id,
        input.name,
        input.description || '',
        input.creator || ''
      );
    }
  } catch (error) {
    console.debug('[FTS] collections insert skipped:', error);
  }

  return input.id;
}

/**
 * Update collection metadata (for upgrades)
 */
export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection,
    'name' | 'description' | 'creator' | 'explicitContent' |
    'packageVersion' | 'dateModified' | 'storageUrl' |
    'thumbnailPath' | 'thumbnailWidth' | 'thumbnailHeight' | 'itemsCount'
  >>
): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.creator !== undefined) {
    setClauses.push('creator = ?');
    params.push(updates.creator);
  }
  if (updates.explicitContent !== undefined) {
    setClauses.push('explicit_content = ?');
    params.push(updates.explicitContent ? 1 : 0);
  }
  if (updates.packageVersion !== undefined) {
    setClauses.push('package_version = ?');
    params.push(updates.packageVersion);
  }
  if (updates.dateModified !== undefined) {
    setClauses.push('date_modified = ?');
    params.push(updates.dateModified);
  }
  if (updates.storageUrl !== undefined) {
    setClauses.push('storage_url = ?');
    params.push(updates.storageUrl);
  }
  if (updates.thumbnailPath !== undefined) {
    setClauses.push('thumbnail_path = ?');
    params.push(updates.thumbnailPath);
  }
  if (updates.thumbnailWidth !== undefined) {
    setClauses.push('thumbnail_width = ?');
    params.push(updates.thumbnailWidth);
  }
  if (updates.thumbnailHeight !== undefined) {
    setClauses.push('thumbnail_height = ?');
    params.push(updates.thumbnailHeight);
  }
  if (updates.itemsCount !== undefined) {
    setClauses.push('items_count = ?');
    params.push(updates.itemsCount);
  }

  params.push(id);

  await db.prepare(`
    UPDATE collections SET ${setClauses.join(', ')} WHERE id = ?
  `).run(...params);

  // Update FTS index if searchable fields changed
  if (updates.name !== undefined || updates.description !== undefined || updates.creator !== undefined) {
    // Get current values for fields that weren't updated
    const current = await db.prepare(`
      SELECT name, description, creator FROM collections WHERE id = ?
    `).get(id) as { name: string; description: string | null; creator: string | null };

    try {
      const ftsAvailable = await isCollectionsFtsAvailableAsync(db);
      if (ftsAvailable) {
        await db.prepare(`
          UPDATE collections_fts
          SET name = ?, description = ?, creator = ?
          WHERE collection_id = ?
        `).run(
          updates.name ?? current.name,
          updates.description ?? current.description ?? '',
          updates.creator ?? current.creator ?? '',
          id
        );
      }
    } catch (error) {
      console.debug('[FTS] collections update skipped:', error);
    }
  }
}

/**
 * Increment download count for a collection
 */
export async function incrementCollectionDownloads(id: string): Promise<void> {
  const db = await getDatabase();

  await db.prepare(`
    UPDATE collections SET downloads_count = downloads_count + 1 WHERE id = ?
  `).run(id);
}

/**
 * Delete a collection and its associated storage blobs
 * Does NOT delete the cards in the collection (use deleteCollectionWithCards for that)
 */
export async function deleteCollection(id: string): Promise<void> {
  const db = await getDatabase();

  // Get collection storage URLs before deleting
  const collection = await db.prepare(`
    SELECT storage_url, thumbnail_path FROM collections WHERE id = ?
  `).get<{ storage_url: string | null; thumbnail_path: string | null }>(id);

  // First unlink all cards from this collection
  await db.prepare(`
    UPDATE cards SET collection_id = NULL, collection_item_id = NULL WHERE collection_id = ?
  `).run(id);

  // Delete from FTS index (optional)
  try {
    const ftsAvailable = await isCollectionsFtsAvailableAsync(db);
    if (ftsAvailable) {
      await db.prepare(`DELETE FROM collections_fts WHERE collection_id = ?`).run(id);
    }
  } catch (error) {
    console.debug('[FTS] collections delete skipped:', error);
  }

  // Then delete the collection
  await db.prepare(`DELETE FROM collections WHERE id = ?`).run(id);

  // Delete storage blobs (after DB deletion to ensure consistency)
  if (collection) {
    const { deleteBlob } = await import('@/lib/storage');
    const urlsToDelete = [collection.storage_url, collection.thumbnail_path].filter(Boolean) as string[];

    for (const url of urlsToDelete) {
      try {
        const fullUrl = url.includes('://') ? url : `r2://${url}`;
        await deleteBlob(fullUrl);
      } catch (error) {
        console.error(`[deleteCollection] Failed to delete storage blob ${url}:`, error);
      }
    }
  }
}

/**
 * Delete a collection and all its cards (including their storage)
 */
export async function deleteCollectionWithCards(id: string): Promise<void> {
  const db = await getDatabase();

  // Get all card IDs in this collection
  const cards = await db.prepare(`
    SELECT id FROM cards WHERE collection_id = ?
  `).all<{ id: string }>(id);

  // Import deleteCard to properly clean up each card
  const { deleteCard } = await import('./cards');

  // Delete each card (this handles storage cleanup)
  for (const card of cards) {
    try {
      await deleteCard(card.id);
    } catch (error) {
      console.error(`[deleteCollectionWithCards] Failed to delete card ${card.id}:`, error);
    }
  }

  // Now delete the collection itself
  await deleteCollection(id);
}

/**
 * Update collection visibility
 */
export async function updateCollectionVisibility(
  id: string,
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked'
): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);

  await db.prepare(`
    UPDATE collections SET visibility = ?, updated_at = ? WHERE id = ?
  `).run(visibility, now, id);
}

/**
 * Generate a unique slug for a collection
 */
export async function generateCollectionSlug(name: string): Promise<string> {
  const db = await getDatabase();
  const baseSlug = generateSlug(name);

  // Check if slug exists
  const existing = await db.prepare(`
    SELECT COUNT(*) as count FROM collections WHERE slug = ? OR slug LIKE ?
  `).get(baseSlug, `${baseSlug}-%`) as { count: number };

  if (existing.count === 0) {
    return baseSlug;
  }

  // Find next available number
  const maxResult = await db.prepare(`
    SELECT slug FROM collections WHERE slug = ? OR slug LIKE ? ORDER BY slug DESC LIMIT 1
  `).get(baseSlug, `${baseSlug}-%`) as { slug: string } | undefined;

  if (!maxResult || maxResult.slug === baseSlug) {
    return `${baseSlug}-2`;
  }

  const match = maxResult.slug.match(/-(\d+)$/);
  const nextNum = match ? parseInt(match[1], 10) + 1 : 2;
  return `${baseSlug}-${nextNum}`;
}

// Helper to map DB row to Collection
function mapRowToCollection(row: Record<string, unknown>): Collection {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string | null,
    creator: row.creator as string | null,
    explicitContent: !!(row.explicit_content as number),
    packageId: row.package_id as string | null,
    packageVersion: row.package_version as string | null,
    entryResourceKind: row.entry_resource_kind as number | null,
    entryResourceId: row.entry_resource_id as string | null,
    thumbnailResourceKind: row.thumbnail_resource_kind as number | null,
    thumbnailResourceId: row.thumbnail_resource_id as string | null,
    dateCreated: row.date_created as string | null,
    dateModified: row.date_modified as string | null,
    storageUrl: row.storage_url as string,
    thumbnailPath: row.thumbnail_path as string | null,
    thumbnailWidth: row.thumbnail_width as number | null,
    thumbnailHeight: row.thumbnail_height as number | null,
    uploaderId: row.uploader_id as string,
    visibility: row.visibility as 'public' | 'nsfw_only' | 'unlisted' | 'blocked',
    itemsCount: row.items_count as number,
    downloadsCount: row.downloads_count as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
