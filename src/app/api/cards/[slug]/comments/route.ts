import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { addComment, getComments } from '@/lib/db/cards';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cards/[slug]/comments
 * Get all comments for a card
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Get card ID from slug
    const db = getDb();
    const card = db.prepare('SELECT id FROM cards WHERE slug = ?').get(slug) as { id: string } | undefined;

    if (!card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    const comments = getComments(card.id);

    // Organize comments into threaded structure
    const threadedComments = buildCommentTree(comments);

    return NextResponse.json({
      comments: threadedComments,
      total: comments.length,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cards/[slug]/comments
 * Add a comment to a card
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
    const content = body.content as string;
    const parentId = body.parentId as string | undefined;

    // Validate content
    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    if (content.length > 10000) {
      return NextResponse.json(
        { error: 'Comment is too long (max 10000 characters)' },
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

    // Validate parent comment if provided
    if (parentId) {
      const parentComment = db.prepare('SELECT id FROM comments WHERE id = ? AND card_id = ?').get(parentId, card.id);
      if (!parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        );
      }
    }

    // Add comment
    const commentId = addComment(card.id, session.user.id, content.trim(), parentId);

    // Get user info for response
    const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(session.user.id) as {
      username: string;
      display_name: string | null;
    };

    return NextResponse.json({
      success: true,
      data: {
        id: commentId,
        userId: session.user.id,
        username: user.username,
        displayName: user.display_name,
        parentId: parentId || null,
        content: content.trim(),
        createdAt: Math.floor(Date.now() / 1000),
      },
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

// Helper to build comment tree
interface Comment {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  parentId: string | null;
  content: string;
  createdAt: number;
  replies?: Comment[];
}

function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>();
  const rootComments: Comment[] = [];

  // First pass: create map of all comments with empty replies array
  for (const comment of comments) {
    commentMap.set(comment.id, { ...comment, replies: [] });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const commentWithReplies = commentMap.get(comment.id)!;

    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies!.push(commentWithReplies);
      } else {
        // Parent not found, treat as root
        rootComments.push(commentWithReplies);
      }
    } else {
      rootComments.push(commentWithReplies);
    }
  }

  return rootComments;
}
