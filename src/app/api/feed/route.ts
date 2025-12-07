import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/async-db';
import { getSession } from '@/lib/auth';

type SortOption = 'for_you' | 'newest' | 'modified' | 'upvotes' | 'downloads' | 'favorites';
type SortOrder = 'asc' | 'desc';

interface FeedCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  thumbnailPath: string | null;
  upvotes: number;
  downloadsCount: number;
  favoritesCount: number;
  createdAt: number;
  modifiedAt: number;
  reason: 'followed_user' | 'followed_tag' | 'trending';
  uploader: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

// Map sort options to SQL columns
const sortColumns: Record<SortOption, string> = {
  for_you: 'c.created_at', // Not actually used for for_you
  newest: 'c.created_at',
  modified: 'c.updated_at',
  upvotes: 'c.upvotes',
  downloads: 'c.downloads_count',
  favorites: 'c.favorites_count',
};

/**
 * GET /api/feed
 * Get personalized feed for current user
 * Query params:
 *  - page: number (default 1)
 *  - limit: number (default 24, max 50)
 *  - sort: for_you | newest | modified | upvotes | downloads | favorites (default: newest)
 *  - order: asc | desc (default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;
    const sort = (searchParams.get('sort') || 'newest') as SortOption;
    const order = (searchParams.get('order') || 'desc') as SortOrder;

    // Validate sort option
    if (!sortColumns[sort]) {
      return NextResponse.json({ error: 'Invalid sort option' }, { status: 400 });
    }

    // Non-authenticated or non-personalized sort
    if (!session || sort !== 'for_you') {
      return getSortedFeed(request, session?.user?.id || null, sort, order, page, limit, offset);
    }

    // For authenticated users with "for_you" sort, use personalized feed

    const db = await getDatabase();
    const userId = session.user.id;

    // Get blocked tags for filtering
    const blockedTags = await db.prepare(`
      SELECT tag_id FROM tag_preferences
      WHERE user_id = ? AND preference = 'block'
    `).all<{ tag_id: number }>(userId);
    const blockedTagIds = blockedTags.map(t => t.tag_id);

    // Build blocked tags condition
    const blockedTagCondition = blockedTagIds.length > 0
      ? `AND c.id NOT IN (
          SELECT ct.card_id FROM card_tags ct
          WHERE ct.tag_id IN (${blockedTagIds.join(',')})
        )`
      : '';

    // Get cards from followed users
    const followedUserCards = await db.prepare(`
      SELECT
        c.id, c.slug, c.name, c.description, c.creator,
        cv.thumbnail_path, c.upvotes, c.downloads_count, c.favorites_count,
        c.created_at, c.updated_at,
        u.id as uploader_id, u.username, u.display_name, u.avatar_url,
        'followed_user' as reason
      FROM cards c
      JOIN card_versions cv ON c.head_version_id = cv.id
      LEFT JOIN users u ON c.uploader_id = u.id
      WHERE c.uploader_id IN (
        SELECT following_id FROM user_follows WHERE follower_id = ?
      )
      AND c.visibility = 'public'
      AND c.moderation_state = 'ok'
      ${blockedTagCondition}
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      upvotes: number;
      downloads_count: number;
      favorites_count: number;
      created_at: number;
      updated_at: number;
      uploader_id: string | null;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      reason: string;
    }>(userId);

    // Get cards with followed tags
    const followedTagCards = await db.prepare(`
      SELECT DISTINCT
        c.id, c.slug, c.name, c.description, c.creator,
        cv.thumbnail_path, c.upvotes, c.downloads_count, c.favorites_count,
        c.created_at, c.updated_at,
        u.id as uploader_id, u.username, u.display_name, u.avatar_url,
        'followed_tag' as reason
      FROM cards c
      JOIN card_versions cv ON c.head_version_id = cv.id
      JOIN card_tags ct ON c.id = ct.card_id
      LEFT JOIN users u ON c.uploader_id = u.id
      WHERE ct.tag_id IN (
        SELECT tag_id FROM tag_preferences WHERE user_id = ? AND preference = 'follow'
      )
      AND c.visibility = 'public'
      AND c.moderation_state = 'ok'
      ${blockedTagCondition}
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      upvotes: number;
      downloads_count: number;
      favorites_count: number;
      created_at: number;
      updated_at: number;
      uploader_id: string | null;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      reason: string;
    }>(userId);

    // Get trending cards to fill gaps
    const trendingCards = await db.prepare(`
      SELECT
        c.id, c.slug, c.name, c.description, c.creator,
        cv.thumbnail_path, c.upvotes, c.downloads_count, c.favorites_count,
        c.created_at, c.updated_at,
        u.id as uploader_id, u.username, u.display_name, u.avatar_url,
        'trending' as reason
      FROM cards c
      JOIN card_versions cv ON c.head_version_id = cv.id
      LEFT JOIN users u ON c.uploader_id = u.id
      WHERE c.visibility = 'public'
      AND c.moderation_state = 'ok'
      ${blockedTagCondition}
      ORDER BY (c.upvotes + c.downloads_count * 0.5) DESC, c.created_at DESC
      LIMIT 50
    `).all<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      upvotes: number;
      downloads_count: number;
      favorites_count: number;
      created_at: number;
      updated_at: number;
      uploader_id: string | null;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      reason: string;
    }>();

    // Combine and deduplicate
    const seenIds = new Set<string>();
    const allCards: FeedCard[] = [];

    const mapCard = (row: typeof followedUserCards[0]): FeedCard => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      creator: row.creator,
      thumbnailPath: row.thumbnail_path,
      upvotes: row.upvotes,
      downloadsCount: row.downloads_count,
      favoritesCount: row.favorites_count,
      createdAt: row.created_at,
      modifiedAt: row.updated_at,
      reason: row.reason as FeedCard['reason'],
      uploader: row.uploader_id ? {
        id: row.uploader_id,
        username: row.username!,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      } : null,
    });

    // Priority order: followed users, then followed tags, then trending
    // Interleave to keep feed interesting
    const sources = [
      { cards: followedUserCards, index: 0 },
      { cards: followedTagCards, index: 0 },
      { cards: trendingCards, index: 0 },
    ];

    // Round-robin interleaving with priority to personalized content
    let roundRobin = 0;
    while (allCards.length < limit + offset) {
      let added = false;

      // Try each source in round-robin order
      for (let i = 0; i < sources.length; i++) {
        const sourceIdx = (roundRobin + i) % sources.length;
        const source = sources[sourceIdx];

        while (source.index < source.cards.length) {
          const card = source.cards[source.index];
          source.index++;

          if (!seenIds.has(card.id)) {
            seenIds.add(card.id);
            allCards.push(mapCard(card));
            added = true;
            break;
          }
        }

        if (added) break;
      }

      if (!added) break; // No more cards in any source
      roundRobin++;
    }

    // Apply pagination
    const paginatedCards = allCards.slice(offset, offset + limit);
    const total = allCards.length;

    return NextResponse.json({
      items: paginatedCards,
      total,
      page,
      limit,
      hasMore: offset + paginatedCards.length < total,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}

/**
 * Sorted feed with optional blocked tag filtering for authenticated users
 */
async function getSortedFeed(
  request: NextRequest,
  userId: string | null,
  sort: SortOption,
  order: SortOrder,
  page: number,
  limit: number,
  offset: number
) {
  try {
    const db = await getDatabase();

    // Get blocked tags for filtering (if authenticated)
    let blockedTagCondition = '';
    if (userId) {
      const blockedTags = await db.prepare(`
        SELECT tag_id FROM tag_preferences
        WHERE user_id = ? AND preference = 'block'
      `).all<{ tag_id: number }>(userId);
      const blockedTagIds = blockedTags.map(t => t.tag_id);

      if (blockedTagIds.length > 0) {
        blockedTagCondition = `AND c.id NOT IN (
          SELECT ct.card_id FROM card_tags ct
          WHERE ct.tag_id IN (${blockedTagIds.join(',')})
        )`;
      }
    }

    const sortColumn = sortColumns[sort];
    const sortDir = order.toUpperCase();

    // Get sorted cards
    const cards = await db.prepare(`
      SELECT
        c.id, c.slug, c.name, c.description, c.creator,
        cv.thumbnail_path, c.upvotes, c.downloads_count, c.favorites_count,
        c.created_at, c.updated_at,
        u.id as uploader_id, u.username, u.display_name, u.avatar_url
      FROM cards c
      JOIN card_versions cv ON c.head_version_id = cv.id
      LEFT JOIN users u ON c.uploader_id = u.id
      WHERE c.visibility = 'public'
      AND c.moderation_state = 'ok'
      ${blockedTagCondition}
      ORDER BY ${sortColumn} ${sortDir}, c.created_at DESC
      LIMIT ? OFFSET ?
    `).all<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      creator: string | null;
      thumbnail_path: string | null;
      upvotes: number;
      downloads_count: number;
      favorites_count: number;
      created_at: number;
      updated_at: number;
      uploader_id: string | null;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }>(limit, offset);

    const totalRow = await db.prepare(`
      SELECT COUNT(*) as count FROM cards
      WHERE visibility = 'public' AND moderation_state = 'ok'
      ${blockedTagCondition}
    `).get<{ count: number }>();
    const total = totalRow?.count || 0;

    const items: FeedCard[] = cards.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      creator: row.creator,
      thumbnailPath: row.thumbnail_path,
      upvotes: row.upvotes,
      downloadsCount: row.downloads_count,
      favoritesCount: row.favorites_count,
      createdAt: row.created_at,
      modifiedAt: row.updated_at,
      reason: 'trending' as const,
      uploader: row.uploader_id ? {
        id: row.uploader_id,
        username: row.username!,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      } : null,
    }));

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching sorted feed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
