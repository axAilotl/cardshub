import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateCardVisibility } from '@/lib/db/cards';

/**
 * PUT /api/admin/cards/[cardId]/visibility
 * Update card visibility (admin only)
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
    const { visibility } = body;

    const validVisibilities = ['public', 'nsfw_only', 'unlisted', 'blocked'];
    if (!validVisibilities.includes(visibility)) {
      return NextResponse.json(
        { error: `Invalid visibility. Must be one of: ${validVisibilities.join(', ')}` },
        { status: 400 }
      );
    }

    updateCardVisibility(cardId, visibility);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating card visibility:', error);
    return NextResponse.json(
      { error: 'Failed to update visibility' },
      { status: 500 }
    );
  }
}
