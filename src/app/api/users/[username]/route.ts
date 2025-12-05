import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: number;
  stats: {
    cardsCount: number;
    totalDownloads: number;
    totalUpvotes: number;
    favoritesCount: number;
  };
}

/**
 * GET /api/users/[username]
 * Get public user profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const db = getDb();

    // Get user by username
    const user = db.prepare(`
      SELECT id, username, display_name, avatar_url, is_admin, created_at
      FROM users
      WHERE username = ?
    `).get(username) as {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      is_admin: number;
      created_at: number;
    } | undefined;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user stats
    const cardsCount = (db.prepare(`
      SELECT COUNT(*) as count FROM cards WHERE uploader_id = ?
    `).get(user.id) as { count: number }).count;

    const totalDownloads = (db.prepare(`
      SELECT COALESCE(SUM(downloads_count), 0) as total FROM cards WHERE uploader_id = ?
    `).get(user.id) as { total: number }).total;

    const totalUpvotes = (db.prepare(`
      SELECT COALESCE(SUM(upvotes - downvotes), 0) as total FROM cards WHERE uploader_id = ?
    `).get(user.id) as { total: number }).total;

    const favoritesCount = (db.prepare(`
      SELECT COUNT(*) as count FROM favorites WHERE user_id = ?
    `).get(user.id) as { count: number }).count;

    const profile: UserProfile = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1,
      createdAt: user.created_at,
      stats: {
        cardsCount,
        totalDownloads,
        totalUpvotes,
        favoritesCount,
      },
    };

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}
