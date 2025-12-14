Plan: Infrastructure Fixes - Caching, FTS, Drizzle, Upload Optimization

 Executive Summary

 Four issues to address:
 1. No persistent cache - Every request hits D1; 60s CDN TTL is too short for
 mostly-static card data
 2. FTS broken on D1 - isCloudflareRuntime() guards skip all FTS updates; search
  will fail in production
 3. Drizzle schema unused - Full typed schema in schema.ts but all queries use
 raw SQL strings
 4. Upload memory risk - 50MB files fully buffered in Worker memory

 D1 FTS5 Confirmed: Cloudflare docs explicitly state D1 supports FTS5 virtual
 tables.

 ---
 Issue 1: KV-Backed Persistent Cache (Priority 1)

 The Problem

 - Cards are uploaded once and rarely updated (mostly static)
 - Current 60-second CDN cache expires quickly
 - Every Worker invocation after TTL hits D1
 - Load times are slow on refresh because "dummy" incremental cache = no
 persistence

 Solution: Cloudflare KV Cache Layer

 Step 1: Add KV namespace to wrangler.toml
 [[kv_namespaces]]
 binding = "CACHE_KV"
 id = "your-kv-namespace-id"  # Create via: wrangler kv:namespace create 
 CACHE_KV

 Step 2: Create cache utility
 // src/lib/cache/kv-cache.ts
 interface CacheOptions {
   ttl?: number;  // seconds, default 24 hours for cards
   tags?: string[];  // for tag-based invalidation
 }

 export async function cacheGet<T>(key: string): Promise<T | null> {
   const kv = await getKV();
   if (!kv) return null;  // Fallback for local dev
   const cached = await kv.get(key, 'json');
   return cached as T | null;
 }

 export async function cacheSet<T>(key: string, value: T, options?: 
 CacheOptions): Promise<void> {
   const kv = await getKV();
   if (!kv) return;
   await kv.put(key, JSON.stringify(value), {
     expirationTtl: options?.ttl || 86400,  // 24 hours default
     metadata: { tags: options?.tags },
   });
 }

 export async function cacheInvalidate(key: string): Promise<void> {
   const kv = await getKV();
   if (!kv) return;
   await kv.delete(key);
 }

 // Tag-based invalidation for card updates
 export async function cacheInvalidateByTag(tag: string): Promise<void> {
   // List and delete all keys with matching tag
   // Note: KV list is eventually consistent but fine for cache invalidation
 }

 Step 3: Cache individual cards (long TTL)
 // src/lib/db/cards.ts - getCardBySlug()
 export async function getCardBySlug(slug: string): Promise<CardDetail | null> {
   const cacheKey = `card:${slug}`;

   // Try cache first
   const cached = await cacheGet<CardDetail>(cacheKey);
   if (cached) return cached;

   // DB fetch
   const card = await fetchCardFromDb(slug);
   if (!card) return null;

   // Cache for 24 hours (card content is static)
   await cacheSet(cacheKey, card, { ttl: 86400, tags: [`card:${card.id}`] });
   return card;
 }

 Step 4: Cache card listings (shorter TTL)
 // src/lib/db/cards.ts - getCards()
 export async function getCards(filters: CardFilters): 
 Promise<PaginatedResponse<CardListItem>> {
   const cacheKey = `cards:${hashFilters(filters)}`;

   // Try cache (5 minute TTL for listings - more dynamic)
   const cached = await cacheGet<PaginatedResponse<CardListItem>>(cacheKey);
   if (cached) return cached;

   // DB fetch
   const result = await fetchCardsFromDb(filters);

   // Cache for 5 minutes
   await cacheSet(cacheKey, result, { ttl: 300 });
   return result;
 }

 Step 5: Invalidate on card updates
 // When card is created/updated/deleted:
 await cacheInvalidate(`card:${slug}`);
 // Also invalidate listing caches (or let them expire naturally)

 Cache TTLs

 | Data            | TTL       | Reason                                       |
 |-----------------|-----------|----------------------------------------------|
 | Individual card | 24 hours  | Cards rarely change after upload             |
 | Card listings   | 5 minutes | New uploads should appear reasonably quickly |
 | User profile    | 1 hour    | Profiles change infrequently                 |
 | Tags            | 1 hour    | Tags are very stable                         |
 | Stats           | 5 minutes | Platform-wide stats aggregate                |

 Files to Create

 - src/lib/cache/kv-cache.ts - KV cache utilities
 - src/lib/cloudflare/kv.ts - KV binding accessor

 Files to Modify

 - wrangler.toml - Add KV namespace binding
 - src/lib/db/cards.ts - Add caching to getCardBySlug(), getCards()
 - src/app/api/cards/[slug]/route.ts - Invalidate cache on updates

 ---
 Issue 2: Fix Full-Text Search on D1 (Priority 2)

 Current Problem

 // src/lib/db/index.ts:267-303
 export async function updateFtsIndex(...): Promise<void> {
   if (isCloudflareRuntime()) return;  // NO-OP on D1!
   // ... FTS never updated in production
 }

 The /api/search/route.ts queries cards_fts which doesn't exist on D1.

 Fix

 Step 1: Add FTS table to D1 migrations
 -- Run via wrangler d1 execute
 CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
   card_id UNINDEXED,
   name,
   description,
   creator,
   creator_notes,
   tokenize='porter unicode61 remove_diacritics 1'
 );

 Step 2: Remove runtime guards
 // src/lib/db/index.ts - Remove these lines:
 if (isCloudflareRuntime()) return;  // DELETE THIS

 // src/lib/db/cards.ts - Remove wrapper functions:
 async function updateFtsIndexAsync(...) {
   if (!isCloudflareRuntime()) {  // DELETE THIS CHECK
     await updateFtsIndex(...);
   }
 }

 Step 3: Backfill existing cards on D1
 INSERT INTO cards_fts (card_id, name, description, creator, creator_notes)
 SELECT c.id, c.name, c.description, c.creator, c.creator_notes
 FROM cards c
 WHERE c.visibility = 'public';

 Files to Modify

 - src/lib/db/index.ts (lines 267-303) - Remove isCloudflareRuntime() guards
 - src/lib/db/cards.ts (lines 11-31) - Simplify FTS wrapper functions
 - src/lib/db/schema.sql - Add FTS table definition for documentation

 ---
 Issue 3: Migrate Queries to Drizzle (Priority 3)

 Current State

 - Schema defined in src/lib/db/schema.ts with full types
 - Queries use raw SQL in src/lib/db/cards.ts
 - No type safety on query results

 Migration Strategy

 Phase 1: Setup Drizzle client
 // src/lib/db/drizzle.ts
 import { drizzle } from 'drizzle-orm/d1';
 import * as schema from './schema';

 export function getDrizzle(db: D1Database) {
   return drizzle(db, { schema });
 }

 Phase 2: Migrate critical queries first
 Priority order (by frequency/complexity):
 1. getCards() - Main listing query
 2. getCardBySlug() - Single card fetch
 3. createCard() - Card creation
 4. Vote/favorite operations

 Phase 3: Type-safe results
 // Before (raw SQL)
 const rows = await db.prepare('SELECT * FROM cards WHERE ...').all();
 const cards = rows.results as CardRow[];  // Manual casting

 // After (Drizzle)
 const cards = await drizzle
   .select()
   .from(schema.cards)
   .where(eq(schema.cards.visibility, 'public'))
   .all();  // Fully typed

 Files to Modify

 - src/lib/db/drizzle.ts (new) - Drizzle client setup
 - src/lib/db/cards.ts - Migrate queries
 - src/lib/db/async-db.ts - Expose Drizzle instance

 ---
 Issue 4: Upload Optimization (Priority 4)

 Current Flow (Risky)

 Client: Parse card → Extract assets → Compute tokens
        ↓
 Server: FormData → arrayBuffer() → Buffer.from() → Process → R2.put()
        (50MB buffered twice in Worker memory)

 Proposed Flow (Multi-File Presigned)

 Must handle all file types:
 - PNG cards (single file + extracted icon)
 - JSON cards (single file, no icon)
 - CharX packages (ZIP with card.json + assets/)
 - Voxta packages (.voxpkg with multiple characters + assets)

 Client: Parse card → Extract assets → Compute tokens
        ↓
 Client: Request presigned URLs for ALL files:
         - Original file (.png/.json/.charx/.voxpkg)
         - Main icon/thumbnail (extracted, clean PNG)
         - Each extracted asset (images, audio from CharX/Voxta)
        ↓
 Server: Generate presigned PUT URLs for each file
        ↓
 Client: Upload all files directly to R2 (parallel, bypass Worker)
        ↓
 Client: Send confirmation with metadata JSON:
         - Parsed card data (name, desc, tokens, etc.)
         - Asset manifest (R2 paths for each uploaded file)
         - Content hash for deduplication
        ↓
 Server: Verify files in R2, create DB records, generate thumbnails

 Implementation

 Step 1: Batch presigned URL endpoint
 // POST /api/uploads/presign
 // Request:
 {
   sessionId: string,  // Client-generated upload session
   files: [
     { key: "original", filename: "card.charx", size: 1234567, contentType:
 "application/zip" },
     { key: "icon", filename: "icon.png", size: 45000, contentType: "image/png"
 },
     { key: "asset-0", filename: "background.png", size: 200000, contentType:
 "image/png" },
     { key: "asset-1", filename: "audio.mp3", size: 500000, contentType:
 "audio/mpeg" },
   ]
 }
 // Response:
 {
   sessionId: string,
   urls: {
     "original": { uploadUrl: "https://...", r2Key:
 "uploads/session123/card.charx" },
     "icon": { uploadUrl: "https://...", r2Key: "uploads/session123/icon.png" },
     ...
   }
 }

 Step 2: Confirmation endpoint
 // POST /api/uploads/confirm
 // Request:
 {
   sessionId: string,
   metadata: {
     name: string,
     description: string,
     tokens: TokenCounts,
     sourceFormat: "png" | "json" | "charx" | "voxta",
     specVersion: "v2" | "v3",
     hasLorebook: boolean,
     // ... all parsed metadata
   },
   files: {
     original: { r2Key: string, contentHash: string },
     icon: { r2Key: string } | null,
     assets: [{ r2Key: string, name: string, type: string }]
   },
   // For multi-char Voxta packages
   isMultiCharPackage?: boolean,
   packageCharCount?: number,
 }
 // Server: Verify files exist in R2, create card/collection records

 Step 3: Client upload orchestration
 // In upload page:
 async function uploadCard(parsedResult: ParseResultWithAssets) {
   // 1. Request presigned URLs
   const { urls } = await fetch('/api/uploads/presign', {
     method: 'POST',
     body: JSON.stringify({
       sessionId: crypto.randomUUID(),
       files: buildFileManifest(parsedResult),
     }),
   }).then(r => r.json());

   // 2. Upload all files in parallel (direct to R2)
   await Promise.all([
     fetch(urls.original.uploadUrl, { method: 'PUT', body: originalFile }),
     parsedResult.mainImage && fetch(urls.icon.uploadUrl, { method: 'PUT', body:
  parsedResult.mainImage }),
     ...parsedResult.extractedAssets.map((asset, i) =>
       fetch(urls[`asset-${i}`].uploadUrl, { method: 'PUT', body: asset.buffer
 })
     ),
   ]);

   // 3. Confirm upload
   const card = await fetch('/api/uploads/confirm', {
     method: 'POST',
     body: JSON.stringify({ sessionId, metadata, files }),
   }).then(r => r.json());
 }

 Files to Create

 - src/app/api/uploads/presign/route.ts - Generate batch presigned URLs
 - src/app/api/uploads/confirm/route.ts - Confirm and create card records
 - src/lib/storage/presign.ts - R2 presigned URL utilities

 Files to Modify

 - src/app/upload/page.tsx - Update client upload flow
 - src/lib/storage/r2.ts - Add presigned URL generation
 - src/app/api/cards/route.ts - Keep for backwards compat (small files)

 ---
 Implementation Order

 Phase 1: KV Cache (Critical - Performance)

 1. Create KV namespace: npx wrangler kv:namespace create CACHE_KV
 2. Add binding to wrangler.toml
 3. Create src/lib/cloudflare/kv.ts - KV binding accessor
 4. Create src/lib/cache/kv-cache.ts - Cache utilities
 5. Add caching to getCardBySlug() (24h TTL)
 6. Add caching to getCards() (5min TTL)
 7. Add cache invalidation on card updates
 8. Deploy and verify cache hits in production

 Phase 2: FTS Fix (Critical - Search broken)

 1. Create FTS table on D1: npx wrangler d1 execute cardshub-db --remote 
 --command "CREATE VIRTUAL TABLE..."
 2. Remove isCloudflareRuntime() guards in src/lib/db/index.ts
 3. Simplify FTS wrappers in src/lib/db/cards.ts
 4. Backfill existing cards: INSERT INTO cards_fts SELECT...
 5. Test /api/search endpoint on production

 Phase 3: Drizzle Migration (Quality)

 1. Create src/lib/db/drizzle.ts - Drizzle client wrapper
 2. Update src/lib/db/async-db.ts - Expose Drizzle instance alongside raw db
 3. Migrate getCards() in src/lib/db/cards.ts (most complex query)
 4. Migrate getCardBySlug()
 5. Migrate createCard() and update operations
 6. Migrate vote/favorite/comment operations
 7. Remove raw SQL strings, keep only Drizzle

 Phase 4: Upload Optimization (Performance)

 1. Create src/lib/storage/presign.ts - R2 presigned URL utilities
 2. Create src/app/api/uploads/presign/route.ts - Batch presigned endpoint
 3. Create src/app/api/uploads/confirm/route.ts - Confirmation endpoint
 4. Update src/app/upload/page.tsx - New client upload flow
 5. Test with:
   - PNG card (single file + icon)
   - CharX package (multiple assets)
   - Voxta package (multi-character)
 6. Keep POST /api/cards for backwards compat / small files

 ---
 Key Files Summary

 KV Cache:
 - wrangler.toml - Add KV namespace binding
 - src/lib/cloudflare/kv.ts (new) - KV binding accessor
 - src/lib/cache/kv-cache.ts (new) - Cache utilities
 - src/lib/db/cards.ts - Add caching to getCardBySlug(), getCards()

 FTS Fix:
 - src/lib/db/index.ts - Lines 267-303 (remove guards)
 - src/lib/db/cards.ts - Lines 11-31 (simplify wrappers)
 - src/app/api/search/route.ts - Queries cards_fts

 Drizzle Migration:
 - src/lib/db/schema.ts - Already has full typed schema
 - src/lib/db/cards.ts - ~1000 lines of raw SQL to migrate
 - src/lib/db/async-db.ts - Database abstraction

 Upload Optimization:
 - src/app/upload/page.tsx - Client upload UI
 - src/lib/client/card-parser.ts - Client-side parsing (keep as-is)
 - src/app/api/cards/route.ts - Current upload handler
 - src/lib/storage/r2.ts - R2 driver

 ---
 Notes

 Why KV over CDN headers alone:
 - CDN cache works for anonymous users but not authenticated requests
 - 60s TTL means constant D1 hits after expiry
 - KV persists across Worker invocations (true application-level cache)
 - Card data is mostly static - 24h TTL is appropriate
