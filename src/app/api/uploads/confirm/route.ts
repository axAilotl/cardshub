/**
 * POST /api/uploads/confirm
 *
 * Confirm an upload session after files have been uploaded directly to R2.
 * Moves files from pending to permanent locations and creates card records.
 * Requires authentication.
 *
 * Request body:
 * {
 *   sessionId: string,
 *   metadata: {
 *     name: string,
 *     description: string,
 *     creator: string,
 *     creatorNotes: string,
 *     specVersion: 'v2' | 'v3',
 *     sourceFormat: 'png' | 'json' | 'charx' | 'voxta',
 *     tokens: { description, personality, scenario, mesExample, firstMes, systemPrompt, postHistory, total },
 *     metadata: { hasAlternateGreetings, alternateGreetingsCount, hasLorebook, lorebookEntriesCount, hasEmbeddedImages, embeddedImagesCount },
 *     tags: string[],
 *     contentHash: string,
 *     cardData: string  // JSON stringified card data
 *   },
 *   files: {
 *     original: { r2Key: string },
 *     icon?: { r2Key: string },
 *     assets?: Array<{ r2Key: string, name: string, type: string, ext: string }>
 *   },
 *   visibility: 'public' | 'private' | 'unlisted'
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { getR2 } from '@/lib/cloudflare/env';
import { createCard, checkBlockedTags } from '@/lib/db/cards';
import { processThumbnail } from '@/lib/image/process';
import { generateId, generateSlug } from '@/lib/utils';
import { isCloudflareRuntime } from '@/lib/db';
import { getPublicUrl } from '@/lib/storage';
import { cacheDeleteByPrefix, CACHE_PREFIX } from '@/lib/cache/kv-cache';

// Token counts schema
const TokensSchema = z.object({
  description: z.number().int().nonnegative(),
  personality: z.number().int().nonnegative(),
  scenario: z.number().int().nonnegative(),
  mesExample: z.number().int().nonnegative(),
  firstMes: z.number().int().nonnegative(),
  systemPrompt: z.number().int().nonnegative(),
  postHistory: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

// Metadata flags schema
const MetadataFlagsSchema = z.object({
  hasAlternateGreetings: z.boolean(),
  alternateGreetingsCount: z.number().int().nonnegative(),
  hasLorebook: z.boolean(),
  lorebookEntriesCount: z.number().int().nonnegative(),
  hasEmbeddedImages: z.boolean(),
  embeddedImagesCount: z.number().int().nonnegative(),
});

// Full metadata schema
const CardMetadataSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(50000).optional().default(''),
  creator: z.string().max(200).optional().default(''),
  creatorNotes: z.string().max(50000).optional().default(''),
  specVersion: z.enum(['v2', 'v3']),
  sourceFormat: z.enum(['png', 'json', 'charx', 'voxta']),
  tokens: TokensSchema,
  metadata: MetadataFlagsSchema,
  tags: z.array(z.string()).default([]),
  contentHash: z.string().min(1),
  cardData: z.string().min(1), // JSON stringified
});

// Files schema
const FilesSchema = z.object({
  original: z.object({ r2Key: z.string().min(1) }),
  icon: z.object({ r2Key: z.string().min(1) }).optional(),
  assets: z.array(z.object({
    r2Key: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    ext: z.string().min(1),
  })).optional().default([]),
});

// Request schema
const ConfirmRequestSchema = z.object({
  sessionId: z.string().uuid(),
  metadata: CardMetadataSchema,
  files: FilesSchema,
  visibility: z.enum(['public', 'private', 'unlisted']).default('public'),
});

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get R2 binding
    const r2 = await getR2();
    if (!r2) {
      return NextResponse.json(
        { error: 'Storage not available' },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = ConfirmRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { sessionId, metadata, files, visibility } = parsed.data;

    // Verify original file exists in R2
    const originalObject = await r2.head(files.original.r2Key);
    if (!originalObject) {
      return NextResponse.json(
        { error: 'Original file not found. Upload may have failed or expired.' },
        { status: 400 }
      );
    }

    // Generate card IDs
    const cardId = generateId();
    const slug = generateSlug(metadata.name);

    // Determine file extension from original key
    const extMatch = files.original.r2Key.match(/\.([^.]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : '.bin';

    // Move original file to permanent location
    const permanentOriginalKey = `cards/${cardId}${ext}`;
    await moveR2Object(r2, files.original.r2Key, permanentOriginalKey);
    const storageUrl = `r2://${permanentOriginalKey}`;

    // Process icon if provided
    let imagePath: string | null = null;
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;
    let thumbnailPath: string | null = null;
    let thumbnailWidth: number | null = null;
    let thumbnailHeight: number | null = null;

    if (files.icon) {
      // Verify icon exists
      const iconObject = await r2.get(files.icon.r2Key);
      if (iconObject) {
        const iconBuffer = await iconObject.arrayBuffer();
        const iconData = Buffer.from(iconBuffer);

        // Move icon to permanent location
        const permanentIconKey = `${cardId}.png`;
        await r2.put(permanentIconKey, iconData);
        await r2.delete(files.icon.r2Key);

        imagePath = isCloudflareRuntime()
          ? getPublicUrl(`r2://${permanentIconKey}`)
          : getPublicUrl(`file:///${permanentIconKey}`);

        // Get image dimensions from PNG header
        if (iconData.length > 24) {
          imageWidth = iconData.readUInt32BE(16);
          imageHeight = iconData.readUInt32BE(20);
        }

        // Generate thumbnail
        try {
          const thumbPath = await processThumbnail(new Uint8Array(iconData), cardId, 'main');
          thumbnailPath = `/api/uploads/${thumbPath}`;
          thumbnailWidth = 500;
          thumbnailHeight = 750;
        } catch (error) {
          console.error('Failed to generate thumbnail:', error);
          thumbnailPath = imagePath;
          thumbnailWidth = imageWidth;
          thumbnailHeight = imageHeight;
        }
      }
    }

    // Process assets
    const savedAssetsData: Array<{ name: string; type: string; ext: string; path: string; thumbnailPath?: string }> = [];
    if (files.assets && files.assets.length > 0) {
      for (const asset of files.assets) {
        const assetObject = await r2.get(asset.r2Key);
        if (assetObject) {
          const assetBuffer = await assetObject.arrayBuffer();
          const assetData = Buffer.from(assetBuffer);

          // Move asset to permanent location
          const permanentAssetKey = `uploads/assets/${cardId}/${asset.name}.${asset.ext}`;
          await r2.put(permanentAssetKey, assetData);
          await r2.delete(asset.r2Key);

          savedAssetsData.push({
            name: asset.name,
            type: asset.type,
            ext: asset.ext,
            path: `/api/uploads/uploads/assets/${cardId}/${asset.name}.${asset.ext}`,
          });
        }
      }
    }

    // Validate tags
    const allTags = [...new Set(metadata.tags)];
    const allTagSlugs = allTags.map(tag =>
      tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    );

    // Check for blocked tags
    const blockedTagNames = await checkBlockedTags(allTagSlugs);
    if (blockedTagNames.length > 0) {
      // Clean up uploaded files
      await r2.delete(permanentOriginalKey);
      if (imagePath) {
        await r2.delete(`${cardId}.png`);
      }
      return NextResponse.json(
        {
          error: `Upload rejected: Card contains blocked tags: ${blockedTagNames.join(', ')}`,
          blockedTags: blockedTagNames,
        },
        { status: 400 }
      );
    }

    // Create card record
    const { cardId: createdCardId, versionId } = await createCard({
      id: cardId,
      slug,
      name: metadata.name,
      description: metadata.description || null,
      creator: metadata.creator || null,
      creatorNotes: metadata.creatorNotes || null,
      uploaderId: session.user.id,
      visibility,
      tagSlugs: allTags,
      version: {
        storageUrl,
        contentHash: metadata.contentHash,
        specVersion: metadata.specVersion,
        sourceFormat: metadata.sourceFormat,
        tokens: metadata.tokens,
        hasAltGreetings: metadata.metadata.hasAlternateGreetings,
        altGreetingsCount: metadata.metadata.alternateGreetingsCount,
        hasLorebook: metadata.metadata.hasLorebook,
        lorebookEntriesCount: metadata.metadata.lorebookEntriesCount,
        hasEmbeddedImages: metadata.metadata.hasEmbeddedImages,
        embeddedImagesCount: metadata.metadata.embeddedImagesCount,
        hasAssets: savedAssetsData.length > 0,
        assetsCount: savedAssetsData.length,
        savedAssets: savedAssetsData.length > 0 ? JSON.stringify(savedAssetsData) : null,
        imagePath,
        imageWidth,
        imageHeight,
        thumbnailPath,
        thumbnailWidth,
        thumbnailHeight,
        cardData: metadata.cardData,
      },
    });

    // Invalidate listing caches
    await cacheDeleteByPrefix(CACHE_PREFIX.CARDS);

    return NextResponse.json({
      success: true,
      data: {
        id: createdCardId,
        slug,
        name: metadata.name,
        versionId,
      },
    });
  } catch (error) {
    console.error('Error confirming upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm upload' },
      { status: 500 }
    );
  }
}

/**
 * Move an R2 object from one key to another
 * R2 doesn't have native move, so we copy + delete
 */
async function moveR2Object(
  r2: Awaited<ReturnType<typeof getR2>>,
  sourceKey: string,
  destKey: string
): Promise<void> {
  if (!r2) throw new Error('R2 not available');

  const object = await r2.get(sourceKey);
  if (!object) throw new Error(`Source object not found: ${sourceKey}`);

  const data = await object.arrayBuffer();
  await r2.put(destKey, data, {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
  });

  await r2.delete(sourceKey);
}
