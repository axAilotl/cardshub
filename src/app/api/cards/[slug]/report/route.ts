import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { reportCard } from '@/lib/db/cards';
import { getSession } from '@/lib/auth';

const VALID_REASONS = [
  'spam',
  'harassment',
  'inappropriate_content',
  'copyright',
  'other',
];

/**
 * POST /api/cards/[slug]/report
 * Report a card for moderation
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
    const reason = body.reason as string;
    const details = body.details as string | undefined;

    // Validate reason
    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate details length
    if (details && details.length > 1000) {
      return NextResponse.json(
        { error: 'Details too long (max 1000 characters)' },
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

    // Check if user already reported this card
    const existingReport = db.prepare(`
      SELECT id FROM reports
      WHERE card_id = ? AND reporter_id = ? AND status = 'pending'
    `).get(card.id, session.user.id);

    if (existingReport) {
      return NextResponse.json(
        { error: 'You have already reported this card' },
        { status: 400 }
      );
    }

    // Create report
    reportCard(card.id, session.user.id, reason, details);

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
    });
  } catch (error) {
    console.error('Error reporting card:', error);
    return NextResponse.json(
      { error: 'Failed to report card' },
      { status: 500 }
    );
  }
}
