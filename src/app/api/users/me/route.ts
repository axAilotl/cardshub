import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/users/me
 * Get current user's profile
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const db = getDb();
    const user = db.prepare(`
      SELECT id, username, display_name, email, avatar_url, is_admin, created_at
      FROM users WHERE id = ?
    `).get(session.user.id) as {
      id: string;
      username: string;
      display_name: string | null;
      email: string | null;
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

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/me
 * Update current user's profile
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { displayName, email } = body;

    const db = getDb();
    const updates: string[] = [];
    const params: (string | null)[] = [];

    // Validate and add display name
    if (displayName !== undefined) {
      if (displayName && displayName.length > 50) {
        return NextResponse.json(
          { error: 'Display name too long (max 50 characters)' },
          { status: 400 }
        );
      }
      updates.push('display_name = ?');
      params.push(displayName || null);
    }

    // Validate and add email
    if (email !== undefined) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      // Check if email is already taken
      if (email) {
        const existing = db.prepare(
          'SELECT id FROM users WHERE email = ? AND id != ?'
        ).get(email, session.user.id);
        if (existing) {
          return NextResponse.json(
            { error: 'Email already in use' },
            { status: 400 }
          );
        }
      }

      updates.push('email = ?');
      params.push(email || null);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push('updated_at = unixepoch()');
    params.push(session.user.id);

    db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Return updated user
    const user = db.prepare(`
      SELECT id, username, display_name, email, avatar_url, is_admin, created_at
      FROM users WHERE id = ?
    `).get(session.user.id) as {
      id: string;
      username: string;
      display_name: string | null;
      email: string | null;
      avatar_url: string | null;
      is_admin: number;
      created_at: number;
    };

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
