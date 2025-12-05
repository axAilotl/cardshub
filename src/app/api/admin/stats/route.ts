import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/admin/stats
 * Get admin dashboard statistics
 */
export async function GET() {
  try {
    // Check authentication and admin status
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const db = getDb();

    // Total cards
    const totalCards = (db.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number }).count;

    // Total users
    const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

    // Total downloads
    const totalDownloads = (db.prepare('SELECT SUM(downloads_count) as total FROM cards').get() as { total: number | null }).total || 0;

    // Pending reports
    const pendingReports = (db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'").get() as { count: number }).count;

    // Cards uploaded today
    const todayStart = Math.floor(Date.now() / 1000) - (new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds());
    const cardsToday = (db.prepare('SELECT COUNT(*) as count FROM cards WHERE created_at >= ?').get(todayStart) as { count: number }).count;

    // Cards by visibility
    const visibilityStats = db.prepare(`
      SELECT
        visibility,
        COUNT(*) as count
      FROM cards
      GROUP BY visibility
    `).all() as { visibility: string; count: number }[];

    const cardsByVisibility = {
      public: 0,
      nsfw_only: 0,
      unlisted: 0,
      blocked: 0,
    };
    for (const row of visibilityStats) {
      if (row.visibility in cardsByVisibility) {
        cardsByVisibility[row.visibility as keyof typeof cardsByVisibility] = row.count;
      }
    }

    // Cards by moderation state
    const moderationStats = db.prepare(`
      SELECT
        moderation_state,
        COUNT(*) as count
      FROM cards
      GROUP BY moderation_state
    `).all() as { moderation_state: string; count: number }[];

    const cardsByModeration = {
      ok: 0,
      review: 0,
      blocked: 0,
    };
    for (const row of moderationStats) {
      if (row.moderation_state in cardsByModeration) {
        cardsByModeration[row.moderation_state as keyof typeof cardsByModeration] = row.count;
      }
    }

    return NextResponse.json({
      totalCards,
      totalUsers,
      totalDownloads,
      pendingReports,
      cardsToday,
      cardsByVisibility,
      cardsByModeration,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
