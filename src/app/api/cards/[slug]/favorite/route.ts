import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toggleFavorite, isFavorited } from '@/lib/db/cards';
import { getSession } from '@/lib/auth';

/**
 * POST /api/cards/[slug]/favorite
 * Toggle favorite status on a card
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get card ID from slug
    const db = getDb();
    const card = db.prepare('SELECT id, favorites_count FROM cards WHERE slug = ?').get(slug) as {
      id: string;
      favorites_count: number;
    } | undefined;

    if (!card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    // Toggle favorite
    const nowFavorited = toggleFavorite(session.user.id, card.id);

    // Get updated count
    const updated = db.prepare('SELECT favorites_count FROM cards WHERE id = ?').get(card.id) as {
      favorites_count: number;
    };

    return NextResponse.json({
      success: true,
      data: {
        isFavorited: nowFavorited,
        favoritesCount: updated.favorites_count,
      },
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return NextResponse.json(
      { error: 'Failed to toggle favorite' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cards/[slug]/favorite
 * Check if current user has favorited this card
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({
        isFavorited: false,
      });
    }

    // Get card ID from slug
    const db = getDb();
    const card = db.prepare('SELECT id FROM cards WHERE slug = ?').get(slug) as { id: string } | undefined;

    if (!card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    const favorited = isFavorited(session.user.id, card.id);

    return NextResponse.json({
      isFavorited: favorited,
    });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return NextResponse.json(
      { error: 'Failed to check favorite status' },
      { status: 500 }
    );
  }
}
