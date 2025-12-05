import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateModerationState } from '@/lib/db/cards';

/**
 * PUT /api/admin/cards/[cardId]/moderation
 * Update card moderation state (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId } = await params;

    // Check authentication and admin status
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { state } = body;

    const validStates = ['ok', 'review', 'blocked'];
    if (!validStates.includes(state)) {
      return NextResponse.json(
        { error: `Invalid moderation state. Must be one of: ${validStates.join(', ')}` },
        { status: 400 }
      );
    }

    updateModerationState(cardId, state);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating card moderation state:', error);
    return NextResponse.json(
      { error: 'Failed to update moderation state' },
      { status: 500 }
    );
  }
}
