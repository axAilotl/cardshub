import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/async-db';

/**
 * GET /api/stats
 * Get public platform statistics
 * Cached for 5 minutes
 */
export async function GET() {
  try {
    const db = await getDatabase();

    // Total public cards
    const cardsResult = await db.prepare(`
      SELECT COUNT(*) as count FROM cards
      WHERE visibility IN ('public', 'nsfw_only') AND moderation_state = 'ok'
    `).get<{ count: number }>();

    // Total users
    const usersResult = await db.prepare('SELECT COUNT(*) as count FROM users').get<{ count: number }>();

    // Total downloads
    const downloadsResult = await db.prepare('SELECT SUM(downloads_count) as total FROM cards').get<{ total: number | null }>();

    // Total creators (users with at least one public card)
    const creatorsResult = await db.prepare(`
      SELECT COUNT(DISTINCT uploader_id) as count FROM cards
      WHERE visibility IN ('public', 'nsfw_only') AND moderation_state = 'ok' AND uploader_id IS NOT NULL
    `).get<{ count: number }>();

    return NextResponse.json({
      totalCards: cardsResult?.count || 0,
      totalUsers: usersResult?.count || 0,
      totalDownloads: downloadsResult?.total || 0,
      totalCreators: creatorsResult?.count || 0,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
