import { NextRequest, NextResponse } from 'next/server';
import { getCollectionBySlug } from '@/lib/db/collections';

/**
 * GET /api/collections/[slug]
 * Get collection detail with child cards
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const collection = await getCollectionBySlug(slug);

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Check visibility
    if (collection.visibility === 'blocked') {
      return NextResponse.json(
        { error: 'Collection not available' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: collection }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}
