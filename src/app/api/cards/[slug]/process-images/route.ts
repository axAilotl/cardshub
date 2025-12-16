/**
 * POST /api/cards/[slug]/process-images
 *
 * Async endpoint to process embedded images in card data.
 * Called after card upload completes to avoid blocking the upload.
 *
 * This downloads external image URLs, converts to WebP, uploads to R2,
 * and rewrites card data to use hosted copies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCardBySlug, updateCardVersion } from '@/lib/db/cards';
import { processCardImages } from '@/lib/image/process';
import { getSession } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { slug } = await params;

    // Get card
    const card = await getCardBySlug(slug);
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    // Auth check - only owner or admin can trigger processing
    const session = await getSession();
    const isOwner = session?.user.id === card.uploader?.id;
    const isAdmin = session?.user.isAdmin ?? false;

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only card owner can process images' },
        { status: 403 }
      );
    }

    // Get current card data
    const cardData = card.cardData;

    console.log(`[ProcessImages] Starting async image processing for card ${slug}`);

    // Process embedded images (download, convert, upload, rewrite URLs)
    const { displayData, urlMapping } = await processCardImages(
      cardData as Record<string, unknown>,
      card.id
    );

    // Update the card version with processed data
    if (urlMapping.size > 0) {
      console.log(`[ProcessImages] Processed ${urlMapping.size} embedded images for card ${slug}`);

      await updateCardVersion(card.versionId, {
        cardData: displayData as Record<string, unknown>,
      });

      return NextResponse.json({
        success: true,
        processedImages: urlMapping.size,
      });
    } else {
      console.log(`[ProcessImages] No embedded images found for card ${slug}`);
      return NextResponse.json({
        success: true,
        processedImages: 0,
        message: 'No embedded images to process',
      });
    }
  } catch (error) {
    console.error('[ProcessImages] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process images',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
