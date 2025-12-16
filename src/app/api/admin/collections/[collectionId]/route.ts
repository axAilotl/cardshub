import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDatabase } from '@/lib/db/async-db';
import { deleteCollection, deleteCollectionWithCards, updateCollectionVisibility } from '@/lib/db/collections';

/**
 * DELETE /api/admin/collections/[collectionId]
 * Delete a collection and optionally its cards
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { collectionId } = await params;
    const { deleteCards } = await request.json().catch(() => ({ deleteCards: false }));

    if (deleteCards) {
      // Use deleteCollectionWithCards to properly clean up storage
      await deleteCollectionWithCards(collectionId);
    } else {
      // Just delete collection, unlink cards
      await deleteCollection(collectionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting collection:', error);
    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/collections/[collectionId]
 * Update collection visibility
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { collectionId } = await params;
    const body = await request.json();
    const { visibility } = body;

    if (!visibility || !['public', 'nsfw_only', 'unlisted', 'blocked'].includes(visibility)) {
      return NextResponse.json(
        { error: 'Invalid visibility' },
        { status: 400 }
      );
    }

    await updateCollectionVisibility(collectionId, visibility);

    // Optionally cascade visibility to child cards
    if (body.cascadeToCards) {
      const db = await getDatabase();
      await db.prepare('UPDATE cards SET visibility = ? WHERE collection_id = ?').run(visibility, collectionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating collection:', error);
    return NextResponse.json(
      { error: 'Failed to update collection' },
      { status: 500 }
    );
  }
}
