# Collections Feature - Implementation Plan

## Overview

Collections are multi-character bundles. MVP focuses on Voxta packages only.

- **Storage**: Extract characters as separate cards with `collection_id` FK
- **Versioning**: Use `package_id` + `date_modified` for delta upgrades on re-upload
- **URLs**: `/collection/[slug]` for collection, `/card/[slug]` for individuals
- **Tag**: Real "COLLECTION" tag in DB, auto-applied to multi-character Voxta cards
- **No editing**: Platform is read-only, editing via federation later
- **Characters only**: Scenarios and books NOT extracted (just characters)

---

## Phase 1: Database Schema

### New `collections` table

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  creator TEXT,
  explicit_content INTEGER DEFAULT 0,  -- NSFW from ExplicitContent

  -- Voxta package.json fields
  package_id TEXT UNIQUE,              -- For matching on re-upload
  package_version TEXT,
  entry_resource_kind INTEGER,
  entry_resource_id TEXT,
  thumbnail_resource_kind INTEGER,
  thumbnail_resource_id TEXT,
  date_created TEXT,                   -- Original package dates
  date_modified TEXT,

  -- Storage
  storage_url TEXT NOT NULL,           -- Original .voxpkg

  -- Display
  thumbnail_path TEXT,
  thumbnail_width INTEGER,
  thumbnail_height INTEGER,

  -- Ownership
  uploader_id TEXT REFERENCES users(id),
  visibility TEXT DEFAULT 'public',

  -- Stats (tracked separately, not aggregated)
  items_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,

  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX idx_collections_package_id ON collections(package_id);
CREATE INDEX idx_collections_uploader ON collections(uploader_id);
CREATE INDEX idx_collections_slug ON collections(slug);
CREATE INDEX idx_collections_visibility ON collections(visibility);
```

### Modify `cards` table

```sql
ALTER TABLE cards ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN collection_item_id TEXT;   -- Character UUID from Voxta

CREATE INDEX idx_cards_collection ON cards(collection_id);
```

### Create COLLECTION tag

```sql
INSERT INTO tags (id, slug, name, category, description, usage_count)
VALUES ('col-tag-id', 'collection', 'Collection', 'format', 'Part of a multi-character collection', 0);
```

---

## Phase 2: Types

### `src/types/collection.ts`

```typescript
export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  explicitContent: boolean;

  // Voxta package metadata
  packageId: string | null;
  packageVersion: string | null;
  entryResourceKind: number | null;
  entryResourceId: string | null;
  thumbnailResourceKind: number | null;
  thumbnailResourceId: string | null;
  dateCreated: string | null;
  dateModified: string | null;

  // Storage
  storageUrl: string;

  // Display
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;

  // Ownership
  uploaderId: string;
  visibility: 'public' | 'private' | 'nsfw_only' | 'unlisted' | 'blocked';

  // Stats
  itemsCount: number;
  downloadsCount: number;

  createdAt: number;
  updatedAt: number;
}

export interface CollectionListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  explicitContent: boolean;
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  itemsCount: number;
  downloadsCount: number;
  visibility: string;
  createdAt: number;

  // Uploader info
  uploader: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

export interface CollectionDetail extends Collection {
  uploader: {
    id: string;
    username: string;
    displayName: string | null;
  };
  items: CardListItem[];  // Child cards
  tags: string[];         // Aggregated from children
}
```

### Modify `src/types/card.ts`

Add to `CardListItem` and `CardDetail`:

```typescript
collectionId?: string;
collectionSlug?: string;
collectionName?: string;
```

---

## Phase 3: Upload Flow

### Detection Logic in `/api/cards/route.ts`

```
1. Parse .voxpkg with readVoxta()
2. Count characters:
   - 1 character → existing single-card flow
   - 2+ characters → redirect to collection flow

3. Collection Flow:
   a. Check package_id in collections table
      - EXISTS + newer date_modified → UPGRADE (create new versions)
      - EXISTS + same/older date → REJECT "Package already uploaded"
      - NOT EXISTS → CREATE new collection

   b. Create collection from package.json:
      - name, description, creator from package
      - explicit_content from ExplicitContent
      - package_id, version, dates
      - visibility inherited from upload request

   c. Find collection thumbnail:
      - Parse ThumbnailResource.Id → find in Characters/{id}/ or Scenarios/{id}/
      - Fallback: first character's thumbnail

   d. For each character:
      - Convert to CCv3 via voxtaToCCv3()
      - Create card record:
        - collection_id = collection.id
        - collection_item_id = character UUID
        - visibility = collection visibility
      - Auto-add "COLLECTION" tag
      - Extract character thumbnail from assets

   e. Store original .voxpkg in storage

   f. Return collection slug (not card slug)
```

### Upgrade Flow (same package_id, newer date)

```
1. Find existing collection by package_id
2. Compare date_modified
3. For each character in new package:
   - Match by UUID (collection_item_id)
   - If EXISTS: compare content, create new card_version if changed
   - If NEW: create new card
4. Characters in old but not new: leave orphaned (don't delete)
5. Update collection metadata (version, dates, thumbnail)
6. Replace stored .voxpkg
```

---

## Phase 4: API Endpoints

### `GET /api/collections`

List collections with pagination.

Query params: `page`, `limit`, `sort`, `includeNsfw`

Response: `PaginatedResponse<CollectionListItem>`

### `GET /api/collections/[slug]`

Get collection detail with child cards.

Response: `CollectionDetail`

### `GET /api/collections/[slug]/download`

Serve original .voxpkg file.

Increments `downloads_count` on collection (not child cards).

### Modified Card Endpoints

`GET /api/cards` and `GET /api/cards/[slug]`:
- Include `collectionId`, `collectionSlug`, `collectionName` if card is part of collection

---

## Phase 5: UI Components

### CardItem - COLLECTION Badge

After VOXTA tag, before other tags:
```
[VOXTA] [COL] [nsfw] [fantasy] ...
```

Badge: file bundle icon + "COL" text
Only shows when `card.collectionId` exists

### Collection Page `/collection/[slug]/page.tsx`

Layout:
```
┌─────────────────────────────────────────────────────┐
│ [Thumbnail]  Collection Name                        │
│              by Creator                             │
│              Description text...                    │
│              [NSFW badge if explicit]               │
│              [Download .voxpkg] [X characters]      │
├─────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │
│ │Card1│ │Card2│ │Card3│ │Card4│  ← Existing        │
│ └─────┘ └─────┘ └─────┘ └─────┘    CardGrid        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Uses existing `CardGrid`, `CardItem`, `CardModal` - NO duplication.

### Card Detail Page

If card is part of collection, show banner:
```
┌─────────────────────────────────────────────────────┐
│ 📦 Part of collection: "Arcane Alley University"   │
│    [View Collection →]                              │
└─────────────────────────────────────────────────────┘
```

### CardModal

Same COLLECTION badge as CardItem.
Add "View Collection" link if `collectionSlug` exists.

---

## Phase 6: Admin Panel

### `/admin/collections`

Same pattern as `/admin/cards`:
- List all collections
- Filter by visibility, uploader
- Actions: change visibility, delete

Add to admin nav in `layout.tsx`.

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── collections/
│   │       ├── route.ts                    # GET list
│   │       └── [slug]/
│   │           ├── route.ts                # GET detail
│   │           └── download/
│   │               └── route.ts            # GET .voxpkg
│   ├── collection/
│   │   └── [slug]/
│   │       └── page.tsx                    # Collection page
│   └── admin/
│       └── collections/
│           └── page.tsx                    # Admin collections
├── components/
│   └── collections/
│       └── collection-badge.tsx            # COL badge component
├── lib/
│   └── db/
│       └── collections.ts                  # Collection DB operations
└── types/
    └── collection.ts                       # Collection types
```

---

## Implementation Order

1. [ ] **Schema**: Add collections table, modify cards table, create COLLECTION tag
2. [ ] **Types**: `src/types/collection.ts`, modify `src/types/card.ts`
3. [ ] **DB Layer**: `src/lib/db/collections.ts` (CRUD operations)
4. [ ] **Upload Detection**: Modify `/api/cards/route.ts` for multi-char Voxta
5. [ ] **Collection APIs**:
   - [ ] `GET /api/collections`
   - [ ] `GET /api/collections/[slug]`
   - [ ] `GET /api/collections/[slug]/download`
6. [ ] **Modify Card APIs**: Add collection fields to card responses
7. [ ] **Collection Page**: `/collection/[slug]/page.tsx`
8. [ ] **CardItem Badge**: COLLECTION badge component
9. [ ] **Card Detail**: Collection banner with link
10. [ ] **CardModal**: Collection badge + link
11. [ ] **Admin Panel**: `/admin/collections` page
12. [ ] **Upgrade Flow**: Handle re-upload with same package_id

---

## Dependencies

- `@character-foundry/voxta@0.1.0` - `readVoxta()`, `voxtaToCCv3()`
- `@character-foundry/loader@0.1.2` - Package parsing

---

## Not In Scope (MVP)

- User-created collections of non-Voxta cards
- Scenarios/books extraction
- In-platform card editing
- Forking into collections
- Collection sharing/permissions beyond visibility
