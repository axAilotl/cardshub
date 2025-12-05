import { NextResponse } from 'next/server';
import { getAllTags } from '@/lib/db/cards';

/**
 * GET /api/tags
 * Get all tags grouped by category
 */
export async function GET() {
  try {
    const tags = getAllTags();
    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}
