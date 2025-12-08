import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/async-db';
import { getCardsByIds } from '@/lib/db/cards';
import { getSession } from '@/lib/auth';
import type { CardListItem, PaginatedResponse } from '@/types/card';

type FeedReason = 'followed_user' | 'followed_tag' | 'trending';

/**
 * GET /api/feed
 * Get personalized feed for current user
 * Returns CardListItem[] with feedReason field for consistency with explore page
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;

    const db = await getDatabase();
    const userId = session?.user?.id || null;

    // Get blocked tags for filtering (if authenticated)
    let blockedTagIds: number[] = [];
    if (userId) {
      const blockedTags = await db.prepare(`
        SELECT tag_id FROM tag_preferences
        WHERE user_id = ? AND preference = 'block'
      `).all<{ tag_id: number }>(userId);
      blockedTagIds = blockedTags.map(t => t.tag_id);
    }

    const blockedTagCondition = blockedTagIds.length > 0
      ? `AND c.id NOT IN (
          SELECT ct.card_id FROM card_tags ct
          WHERE ct.tag_id IN (${blockedTagIds.join(',')})
        )`
      : '';

    // Collect card IDs with reasons
    const cardReasons = new Map<string, FeedReason>();

    if (userId) {
      // Get cards from followed users
      const followedUserCards = await db.prepare(`
        SELECT c.id
        FROM cards c
        WHERE c.uploader_id IN (
          SELECT following_id FROM user_follows WHERE follower_id = ?
        )
        AND c.visibility = 'public'
        AND c.moderation_state = 'ok'
        ${blockedTagCondition}
        ORDER BY c.created_at DESC
        LIMIT 50
      `).all<{ id: string }>(userId);

      for (const card of followedUserCards) {
        if (!cardReasons.has(card.id)) {
          cardReasons.set(card.id, 'followed_user');
        }
      }

      // Get cards with followed tags
      const followedTagCards = await db.prepare(`
        SELECT DISTINCT c.id
        FROM cards c
        JOIN card_tags ct ON c.id = ct.card_id
        WHERE ct.tag_id IN (
          SELECT tag_id FROM tag_preferences WHERE user_id = ? AND preference = 'follow'
        )
        AND c.visibility = 'public'
        AND c.moderation_state = 'ok'
        ${blockedTagCondition}
        ORDER BY c.created_at DESC
        LIMIT 50
      `).all<{ id: string }>(userId);

      for (const card of followedTagCards) {
        if (!cardReasons.has(card.id)) {
          cardReasons.set(card.id, 'followed_tag');
        }
      }
    }

    // Get trending cards to fill gaps
    const trendingCards = await db.prepare(`
      SELECT c.id
      FROM cards c
      WHERE c.visibility = 'public'
      AND c.moderation_state = 'ok'
      ${blockedTagCondition}
      ORDER BY (c.upvotes + c.downloads_count * 0.5) DESC, c.created_at DESC
      LIMIT 100
    `).all<{ id: string }>();

    for (const card of trendingCards) {
      if (!cardReasons.has(card.id)) {
        cardReasons.set(card.id, 'trending');
      }
    }

    // Build ordered list: personalized first, then trending
    const orderedIds: string[] = [];
    const seenIds = new Set<string>();

    // Add personalized cards first (interleaved)
    const followedUserIds = [...cardReasons.entries()]
      .filter(([, reason]) => reason === 'followed_user')
      .map(([id]) => id);
    const followedTagIds = [...cardReasons.entries()]
      .filter(([, reason]) => reason === 'followed_tag')
      .map(([id]) => id);

    // Interleave followed users and tags
    const maxPersonalized = Math.max(followedUserIds.length, followedTagIds.length);
    for (let i = 0; i < maxPersonalized; i++) {
      if (i < followedUserIds.length && !seenIds.has(followedUserIds[i])) {
        orderedIds.push(followedUserIds[i]);
        seenIds.add(followedUserIds[i]);
      }
      if (i < followedTagIds.length && !seenIds.has(followedTagIds[i])) {
        orderedIds.push(followedTagIds[i]);
        seenIds.add(followedTagIds[i]);
      }
    }

    // Add trending to fill remaining slots
    for (const card of trendingCards) {
      if (!seenIds.has(card.id)) {
        orderedIds.push(card.id);
        seenIds.add(card.id);
      }
    }

    // Apply pagination
    const paginatedIds = orderedIds.slice(offset, offset + limit);
    const total = orderedIds.length;

    // Fetch full card data using shared helper (ensures consistent format with explore)
    const cards = await getCardsByIds(paginatedIds, userId || undefined);

    // Add feedReason to each card
    const itemsWithReason: CardListItem[] = cards.map(card => ({
      ...card,
      feedReason: cardReasons.get(card.id) || 'trending',
    }));

    const response: PaginatedResponse<CardListItem> = {
      items: itemsWithReason,
      total,
      page,
      limit,
      hasMore: offset + paginatedIds.length < total,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching feed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
