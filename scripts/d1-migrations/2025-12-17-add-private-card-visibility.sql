-- D1 migration: add 'private' to cards.visibility CHECK constraint
--
-- SQLite/D1 cannot ALTER CHECK constraints in-place, so we rebuild the table.
-- Safe to run on dev; for prod, test first.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS cards_new;

CREATE TABLE cards_new (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  creator TEXT,
  creator_notes TEXT,
  head_version_id TEXT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'nsfw_only', 'unlisted', 'blocked')),
  moderation_state TEXT DEFAULT 'ok' CHECK (moderation_state IN ('ok', 'review', 'blocked')),
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  downloads_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  trending_score REAL GENERATED ALWAYS AS (upvotes + downloads_count * 0.5) VIRTUAL,
  uploader_id TEXT REFERENCES users(id),
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  collection_item_id TEXT,
  processing_status TEXT DEFAULT 'complete' CHECK (processing_status IN ('complete', 'pending', 'processing', 'failed')),
  upload_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

INSERT INTO cards_new (
  id,
  slug,
  name,
  description,
  creator,
  creator_notes,
  head_version_id,
  visibility,
  moderation_state,
  upvotes,
  downvotes,
  favorites_count,
  downloads_count,
  comments_count,
  forks_count,
  uploader_id,
  collection_id,
  collection_item_id,
  processing_status,
  upload_id,
  created_at,
  updated_at
)
SELECT
  id,
  slug,
  name,
  description,
  creator,
  creator_notes,
  head_version_id,
  visibility,
  moderation_state,
  upvotes,
  downvotes,
  favorites_count,
  downloads_count,
  comments_count,
  forks_count,
  uploader_id,
  collection_id,
  collection_item_id,
  processing_status,
  upload_id,
  created_at,
  updated_at
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;

-- Recreate indexes dropped with the table
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_downloads ON cards(downloads_count DESC);
CREATE INDEX IF NOT EXISTS idx_cards_upvotes ON cards(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_cards_slug ON cards(slug);
CREATE INDEX IF NOT EXISTS idx_cards_uploader ON cards(uploader_id);
CREATE INDEX IF NOT EXISTS idx_cards_visibility ON cards(visibility);
CREATE INDEX IF NOT EXISTS idx_cards_head_version ON cards(head_version_id);
CREATE INDEX IF NOT EXISTS idx_cards_collection ON cards(collection_id);
CREATE INDEX IF NOT EXISTS idx_cards_trending ON cards(trending_score DESC);

PRAGMA foreign_keys=ON;

