import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/async-db';
import { isCloudflareRuntime } from '@/lib/db';
import { parseQuery, SearchQuerySchema } from '@/lib/validations';

interface CardSearchResult {
  id: string;
  type: 'card';
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  thumbnailPath: string | null;
  tokensTotal: number;
  upvotes: number;
  downvotes: number;
  downloadsCount: number;
  rank: number;
  snippet: string | null;
}

interface CollectionSearchResult {
  id: string;
  type: 'collection';
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  thumbnailPath: string | null;
  itemsCount: number;
  downloadsCount: number;
  rank: number;
}

type SearchResult = CardSearchResult | CollectionSearchResult;

/**
 * GET /api/search
 * Full-text search with ranking and snippets
 */
export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const parsed = parseQuery(request.nextUrl.searchParams, SearchQuerySchema);
    if ('error' in parsed) return parsed.error;
    const { q: query, limit, offset, nsfw: includeNsfw } = parsed.data;

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        items: [],
        total: 0,
        query: query,
      });
    }

    const db = await getDatabase();

    // Build FTS5 query with prefix matching
    const searchTerm = query.trim();
    const ftsQuery = searchTerm
      .replace(/[\"\']/g, '')
      .split(/\s+/)
      .filter(word => word.length >= 2)
      .map(word => `"${word}"*`)
      .join(' ');

    if (!ftsQuery) {
      return NextResponse.json({
        items: [],
        total: 0,
        query: query,
      });
    }

    // Visibility filter
    const cardVisibilityCondition = includeNsfw
      ? `c.visibility IN ('public', 'nsfw_only')`
      : `c.visibility = 'public'`;

    const collectionVisibilityCondition = includeNsfw
      ? `col.visibility IN ('public', 'nsfw_only')`
      : `col.visibility = 'public'`;

    // For LIKE search fallback (D1 doesn't support FTS5)
    const likePattern = `%${searchTerm}%`;

    // Detect runtime - D1 doesn't support FTS5
    const useCloudflare = isCloudflareRuntime();

    // Count total card results
    let cardTotal = 0;
    if (useCloudflare) {
      // Fallback: LIKE search (no FTS5 on D1)
      const cardCountQuery = `
        SELECT COUNT(*) as total
        FROM cards c
        WHERE (c.name LIKE ? OR c.description LIKE ? OR c.creator LIKE ?)
          AND ${cardVisibilityCondition}
          AND c.moderation_state != 'blocked'
      `;
      const cardTotalResult = await db.prepare(cardCountQuery).get<{ total: number }>(
        likePattern, likePattern, likePattern
      );
      cardTotal = cardTotalResult?.total || 0;
    } else {
      // FTS5 search (local SQLite only)
      const cardCountQuery = `
        SELECT COUNT(*) as total
        FROM cards c
        INNER JOIN cards_fts fts ON c.id = fts.card_id
        WHERE cards_fts MATCH ?
          AND ${cardVisibilityCondition}
          AND c.moderation_state != 'blocked'
      `;
      const cardTotalResult = await db.prepare(cardCountQuery).get<{ total: number }>(ftsQuery);
      cardTotal = cardTotalResult?.total || 0;
    }

    // Count total collection results
    let collectionTotal = 0;
    if (useCloudflare) {
      // Fallback: LIKE search (no FTS5 on D1)
      const collectionCountQuery = `
        SELECT COUNT(*) as total
        FROM collections col
        WHERE (col.name LIKE ? OR col.description LIKE ? OR col.creator LIKE ?)
          AND ${collectionVisibilityCondition}
      `;
      const collectionTotalResult = await db.prepare(collectionCountQuery).get<{ total: number }>(
        likePattern, likePattern, likePattern
      );
      collectionTotal = collectionTotalResult?.total || 0;
    } else {
      // FTS5 search (local SQLite only)
      const collectionCountQuery = `
        SELECT COUNT(*) as total
        FROM collections col
        INNER JOIN collections_fts fts ON col.id = fts.collection_id
        WHERE collections_fts MATCH ?
          AND ${collectionVisibilityCondition}
      `;
      const collectionTotalResult = await db.prepare(collectionCountQuery).get<{ total: number }>(ftsQuery);
      collectionTotal = collectionTotalResult?.total || 0;
    }
    const total = cardTotal + collectionTotal;

    // Get ranked card results
    let cardRows: Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      tokens_total: number;
      upvotes: number;
      downvotes: number;
      downloads_count: number;
      rank: number;
      snippet: string | null;
    }>;

    if (useCloudflare) {
      // Fallback: LIKE search (no FTS5 on D1)
      const cardSearchQuery = `
        SELECT
          c.id,
          c.slug,
          c.name,
          c.description,
          c.creator,
          v.thumbnail_path,
          v.tokens_total,
          c.upvotes,
          c.downvotes,
          c.downloads_count,
          0 as rank,
          NULL as snippet
        FROM cards c
        LEFT JOIN card_versions v ON c.head_version_id = v.id
        WHERE (c.name LIKE ? OR c.description LIKE ? OR c.creator LIKE ?)
          AND ${cardVisibilityCondition}
          AND c.moderation_state != 'blocked'
        ORDER BY c.downloads_count DESC
        LIMIT ? OFFSET ?
      `;
      cardRows = await db.prepare(cardSearchQuery).all(
        likePattern, likePattern, likePattern, limit, offset
      );
    } else {
      // FTS5 search with BM25 ranking and snippets (local SQLite only)
      // Note: bm25() column indices: 0=card_id (unindexed), 1=name, 2=description, 3=creator, 4=creator_notes
      const cardSearchQuery = `
        SELECT
          c.id,
          c.slug,
          c.name,
          c.description,
          c.creator,
          v.thumbnail_path,
          v.tokens_total,
          c.upvotes,
          c.downvotes,
          c.downloads_count,
          bm25(cards_fts, 0.0, 10.0, 5.0, 2.0, 1.0) as rank,
          snippet(cards_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
        FROM cards c
        INNER JOIN cards_fts fts ON c.id = fts.card_id
        LEFT JOIN card_versions v ON c.head_version_id = v.id
        WHERE cards_fts MATCH ?
          AND ${cardVisibilityCondition}
          AND c.moderation_state != 'blocked'
        ORDER BY rank
        LIMIT ? OFFSET ?
      `;
      cardRows = await db.prepare(cardSearchQuery).all(ftsQuery, limit, offset);
    }

    // Get collection results (FTS5 when available, LIKE fallback for D1)
    // Only fetch if we have room in the limit
    const collectionLimit = Math.max(0, limit - cardRows.length);
    let collectionRows: Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      items_count: number;
      downloads_count: number;
      rank?: number;
    }> = [];

    if (collectionLimit > 0) {
      if (useCloudflare) {
        // Fallback: LIKE search (no FTS5 on D1)
        const collectionSearchQuery = `
          SELECT
            col.id,
            col.slug,
            col.name,
            col.description,
            col.creator,
            col.thumbnail_path,
            col.items_count,
            col.downloads_count,
            0 as rank
          FROM collections col
          WHERE (col.name LIKE ? OR col.description LIKE ? OR col.creator LIKE ?)
            AND ${collectionVisibilityCondition}
          ORDER BY col.downloads_count DESC
          LIMIT ?
        `;
        collectionRows = await db.prepare(collectionSearchQuery).all(
          likePattern, likePattern, likePattern, collectionLimit
        );
      } else {
        // FTS5 search with BM25 ranking (local SQLite only)
        // Note: bm25() column indices: 0=collection_id (unindexed), 1=name, 2=description, 3=creator
        const collectionSearchQuery = `
          SELECT
            col.id,
            col.slug,
            col.name,
            col.description,
            col.creator,
            col.thumbnail_path,
            col.items_count,
            col.downloads_count,
            bm25(collections_fts, 0.0, 10.0, 5.0, 2.0) as rank
          FROM collections col
          INNER JOIN collections_fts fts ON col.id = fts.collection_id
          WHERE collections_fts MATCH ?
            AND ${collectionVisibilityCondition}
          ORDER BY rank
          LIMIT ?
        `;
        collectionRows = await db.prepare(collectionSearchQuery).all(ftsQuery, collectionLimit);
      }
    }

    // Combine results - cards first (ranked by FTS), then collections
    const items: SearchResult[] = [
      ...cardRows.map(row => ({
        id: row.id,
        type: 'card' as const,
        slug: row.slug,
        name: row.name,
        description: row.description,
        creator: row.creator,
        thumbnailPath: row.thumbnail_path,
        tokensTotal: row.tokens_total,
        upvotes: row.upvotes,
        downvotes: row.downvotes,
        downloadsCount: row.downloads_count,
        rank: row.rank,
        snippet: row.snippet,
      })),
      ...collectionRows.map(row => ({
        id: row.id,
        type: 'collection' as const,
        slug: row.slug,
        name: row.name,
        description: row.description,
        creator: row.creator,
        thumbnailPath: row.thumbnail_path,
        itemsCount: row.items_count,
        downloadsCount: row.downloads_count,
        rank: row.rank ?? 999, // Use FTS rank when available, fallback to 999
      })),
    ];

    return NextResponse.json({
      items,
      total,
      cardCount: cardTotal,
      collectionCount: collectionTotal,
      query: query,
      hasMore: offset + items.length < total,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
