import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { voteOnCard, getUserVote } from '@/lib/db/cards';
import { getSession } from '@/lib/auth';

/**
 * POST /api/cards/[slug]/vote
 * Vote on a card (upvote or downvote)
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

    // Parse request body
    const body = await request.json();
    const vote = body.vote as number;

    // Validate vote value
    if (vote !== 1 && vote !== -1) {
      return NextResponse.json(
        { error: 'Vote must be 1 (upvote) or -1 (downvote)' },
        { status: 400 }
      );
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

    // Perform vote
    voteOnCard(session.user.id, card.id, vote);

    // Get updated vote counts
    const updated = db.prepare('SELECT upvotes, downvotes FROM cards WHERE id = ?').get(card.id) as {
      upvotes: number;
      downvotes: number;
    };

    // Get user's current vote
    const userVote = getUserVote(session.user.id, card.id);

    return NextResponse.json({
      success: true,
      data: {
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        userVote,
      },
    });
  } catch (error) {
    console.error('Error voting on card:', error);
    return NextResponse.json(
      { error: 'Failed to vote on card' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cards/[slug]/vote
 * Remove vote from a card
 */
export async function DELETE(
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
    const card = db.prepare('SELECT id FROM cards WHERE slug = ?').get(slug) as { id: string } | undefined;

    if (!card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    // Get current vote
    const existingVote = getUserVote(session.user.id, card.id);

    if (existingVote) {
      // Remove vote by voting the same way (toggles off)
      voteOnCard(session.user.id, card.id, existingVote as 1 | -1);
    }

    // Get updated vote counts
    const updated = db.prepare('SELECT upvotes, downvotes FROM cards WHERE id = ?').get(card.id) as {
      upvotes: number;
      downvotes: number;
    };

    return NextResponse.json({
      success: true,
      data: {
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        userVote: null,
      },
    });
  } catch (error) {
    console.error('Error removing vote:', error);
    return NextResponse.json(
      { error: 'Failed to remove vote' },
      { status: 500 }
    );
  }
}
