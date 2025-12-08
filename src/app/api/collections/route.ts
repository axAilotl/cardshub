import { NextRequest, NextResponse } from 'next/server';
import { getCollections } from '@/lib/db/collections';
import { z } from 'zod';

const CollectionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.enum(['newest', 'downloads', 'items']).optional().default('newest'),
  includeNsfw: z.coerce.boolean().optional().default(false),
  uploaderId: z.string().optional(),
});

/**
 * GET /api/collections
 * List collections with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsed = CollectionFiltersSchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      sort: searchParams.get('sort'),
      includeNsfw: searchParams.get('includeNsfw'),
      uploaderId: searchParams.get('uploaderId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const result = await getCollections(parsed.data);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
