import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDatabase } from '@/lib/db/async-db';

interface AdminCollectionRow {
  id: string;
  slug: string;
  name: string;
  creator: string | null;
  visibility: string;
  thumbnail_path: string | null;
  items_count: number;
  downloads_count: number;
  created_at: number;
  uploader_id: string | null;
  uploader_username: string | null;
}

/**
 * GET /api/admin/collections
 * List collections for admin management
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const visibility = searchParams.get('visibility') || 'all';

    const offset = (page - 1) * limit;
    const db = await getDatabase();

    // Build query conditions
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      conditions.push('(col.name LIKE ? OR col.slug LIKE ? OR col.creator LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (visibility !== 'all') {
      conditions.push('col.visibility = ?');
      params.push(visibility);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count
      FROM collections col
      ${whereClause}
    `).get<{ count: number }>(...params);
    const total = countResult?.count || 0;

    // Get collections with uploader info
    const collections = await db.prepare(`
      SELECT col.id, col.slug, col.name, col.creator, col.visibility,
        col.thumbnail_path, col.items_count, col.downloads_count, col.created_at,
        col.uploader_id, u.username as uploader_username
      FROM collections col
      LEFT JOIN users u ON col.uploader_id = u.id
      ${whereClause}
      ORDER BY col.created_at DESC
      LIMIT ? OFFSET ?
    `).all<AdminCollectionRow>(...params, limit, offset);

    const items = collections.map(col => ({
      id: col.id,
      slug: col.slug,
      name: col.name,
      creator: col.creator,
      visibility: col.visibility,
      thumbnailPath: col.thumbnail_path,
      itemsCount: col.items_count,
      downloadsCount: col.downloads_count,
      createdAt: col.created_at,
      uploader: col.uploader_id ? {
        id: col.uploader_id,
        username: col.uploader_username || '',
      } : null,
    }));

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching admin collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
