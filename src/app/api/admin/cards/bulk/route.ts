import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * PUT /api/admin/cards/bulk
 * Bulk update card visibility or moderation state (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authentication and admin status
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { cardIds, visibility, moderationState } = body;

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json(
        { error: 'cardIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (cardIds.length > 100) {
      return NextResponse.json(
        { error: 'Cannot update more than 100 cards at once' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Validate visibility if provided
    if (visibility) {
      const validVisibilities = ['public', 'nsfw_only', 'unlisted', 'blocked'];
      if (!validVisibilities.includes(visibility)) {
        return NextResponse.json(
          { error: `Invalid visibility. Must be one of: ${validVisibilities.join(', ')}` },
          { status: 400 }
        );
      }

      const placeholders = cardIds.map(() => '?').join(', ');
      db.prepare(`
        UPDATE cards
        SET visibility = ?, updated_at = unixepoch()
        WHERE id IN (${placeholders})
      `).run(visibility, ...cardIds);
    }

    // Validate moderation state if provided
    if (moderationState) {
      const validStates = ['ok', 'review', 'blocked'];
      if (!validStates.includes(moderationState)) {
        return NextResponse.json(
          { error: `Invalid moderation state. Must be one of: ${validStates.join(', ')}` },
          { status: 400 }
        );
      }

      const placeholders = cardIds.map(() => '?').join(', ');
      db.prepare(`
        UPDATE cards
        SET moderation_state = ?, updated_at = unixepoch()
        WHERE id IN (${placeholders})
      `).run(moderationState, ...cardIds);
    }

    return NextResponse.json({
      success: true,
      updated: cardIds.length,
    });
  } catch (error) {
    console.error('Error bulk updating cards:', error);
    return NextResponse.json(
      { error: 'Failed to update cards' },
      { status: 500 }
    );
  }
}
