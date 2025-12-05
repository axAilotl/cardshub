/**
 * Database Module
 *
 * Provides database access for local development using better-sqlite3.
 * For Cloudflare D1 deployment, use the driver module instead.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Get database instance (synchronous, better-sqlite3)
 */
export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'cardshub.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run migrations/schema
    const schemaPath = join(process.cwd(), 'src/lib/db/schema.sql');
    try {
      const schema = readFileSync(schemaPath, 'utf-8');
      db.exec(schema);

      // Run migrations for existing databases
      runMigrations(db);
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
    }
  }
  return db;
}

// Alias for backwards compatibility
export const getDbSync = getDb;

/**
 * Run database migrations
 */
function runMigrations(database: Database.Database): void {
  // Check if card_data column exists on cards table (old schema)
  const tableInfo = database.prepare('PRAGMA table_info(cards)').all() as { name: string }[];
  const hasCardDataColumn = tableInfo.some(col => col.name === 'card_data');

  // Only run v1->v2 migration if we have the old schema
  if (hasCardDataColumn) {
    migrateCardsToVersions(database);
  }

  // Schema migrations (add columns if they don't exist)
  const migrations = [
    `ALTER TABLE cards ADD COLUMN head_version_id TEXT`,
    `ALTER TABLE cards ADD COLUMN visibility TEXT DEFAULT 'public'`,
    `ALTER TABLE cards ADD COLUMN moderation_state TEXT DEFAULT 'ok'`,
    `ALTER TABLE cards ADD COLUMN forks_count INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`,
    `ALTER TABLE cards ADD COLUMN creator TEXT`,
    `ALTER TABLE cards ADD COLUMN creator_notes TEXT`,
  ];

  for (const sql of migrations) {
    try {
      database.exec(sql);
    } catch {
      // Column already exists, ignore
    }
  }

  // Initialize FTS5 search index
  initializeFtsIndex(database);
}

/**
 * Migrate v1 cards (with card_data on cards table) to v2 (card_versions)
 */
function migrateCardsToVersions(database: Database.Database): void {
  // Check if we need to migrate
  const needsMigration = database.prepare(`
    SELECT COUNT(*) as count FROM cards
    WHERE head_version_id IS NULL
    AND card_data IS NOT NULL
  `).get() as { count: number };

  if (needsMigration.count === 0) return;

  console.log(`Migrating ${needsMigration.count} cards to card_versions...`);

  const cardsToMigrate = database.prepare(`
    SELECT id, slug, spec_version, source_format,
           tokens_description, tokens_personality, tokens_scenario,
           tokens_mes_example, tokens_first_mes, tokens_system_prompt,
           tokens_post_history, tokens_total,
           has_alt_greetings, alt_greetings_count, has_lorebook, lorebook_entries_count,
           has_embedded_images, embedded_images_count,
           has_assets, assets_count, saved_assets,
           image_path, image_width, image_height,
           thumbnail_path, thumbnail_width, thumbnail_height,
           card_data, created_at
    FROM cards
    WHERE head_version_id IS NULL AND card_data IS NOT NULL
  `).all() as Record<string, unknown>[];

  const insertVersion = database.prepare(`
    INSERT INTO card_versions (
      id, card_id, storage_url, content_hash, spec_version, source_format,
      tokens_description, tokens_personality, tokens_scenario,
      tokens_mes_example, tokens_first_mes, tokens_system_prompt,
      tokens_post_history, tokens_total,
      has_alt_greetings, alt_greetings_count, has_lorebook, lorebook_entries_count,
      has_embedded_images, embedded_images_count,
      has_assets, assets_count, saved_assets,
      image_path, image_width, image_height,
      thumbnail_path, thumbnail_width, thumbnail_height,
      card_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateCard = database.prepare(`UPDATE cards SET head_version_id = ? WHERE id = ?`);

  database.transaction(() => {
    for (const card of cardsToMigrate) {
      const versionId = nanoid();
      const imagePath = card.image_path as string | null;
      const storageUrl = imagePath
        ? `file:///${imagePath.replace(/^\/?uploads\//, '')}`
        : `file:///cards/${card.id}.json`;
      const contentHash = createHash('sha256').update(card.card_data as string).digest('hex');

      insertVersion.run(
        versionId, card.id, storageUrl, contentHash,
        card.spec_version, card.source_format || 'png',
        card.tokens_description, card.tokens_personality, card.tokens_scenario,
        card.tokens_mes_example, card.tokens_first_mes, card.tokens_system_prompt,
        card.tokens_post_history, card.tokens_total,
        card.has_alt_greetings, card.alt_greetings_count,
        card.has_lorebook, card.lorebook_entries_count,
        card.has_embedded_images, card.embedded_images_count,
        card.has_assets || 0, card.assets_count || 0, card.saved_assets,
        card.image_path, card.image_width, card.image_height,
        card.thumbnail_path, card.thumbnail_width, card.thumbnail_height,
        card.card_data, card.created_at
      );
      updateCard.run(versionId, card.id);
    }
  })();

  console.log(`Migrated ${cardsToMigrate.length} cards to card_versions`);
}

/**
 * Initialize FTS5 full-text search index
 */
function initializeFtsIndex(database: Database.Database): void {
  // Drop old FTS table if it uses content= syntax
  try {
    const tableInfo = database.prepare(`
      SELECT sql FROM sqlite_master WHERE name = 'cards_fts' AND type = 'table'
    `).get() as { sql: string } | undefined;

    if (tableInfo?.sql?.includes("content='cards'") || tableInfo?.sql?.includes('content="cards"')) {
      console.log('Dropping old content-linked FTS table...');
      database.exec('DROP TABLE IF EXISTS cards_fts');
    }
  } catch {
    // Ignore
  }

  // Create standalone FTS5 table
  try {
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
        card_id UNINDEXED,
        name,
        description,
        creator,
        creator_notes,
        tokenize='porter unicode61 remove_diacritics 1'
      )
    `);
  } catch (error) {
    console.log('FTS table check:', error instanceof Error ? error.message : error);
  }

  // Populate if needed
  const ftsCount = (database.prepare('SELECT COUNT(*) as count FROM cards_fts').get() as { count: number }).count;
  const cardsCount = (database.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number }).count;

  if (ftsCount === 0 && cardsCount > 0) {
    console.log(`Populating FTS index with ${cardsCount} cards...`);
    rebuildFtsIndex(database);
    console.log('FTS index populated');
  }
}

/**
 * Rebuild FTS index
 */
export function rebuildFtsIndex(database?: Database.Database): void {
  const db = database || getDb();

  db.transaction(() => {
    db.exec('DELETE FROM cards_fts');
    db.exec(`
      INSERT INTO cards_fts(card_id, name, description, creator, creator_notes)
      SELECT id, name, COALESCE(description, ''), COALESCE(creator, ''), COALESCE(creator_notes, '')
      FROM cards
    `);
  })();
}

/**
 * Update FTS index for a single card
 */
export function updateFtsIndex(
  cardId: string,
  name: string,
  description: string | null,
  creator: string | null,
  creatorNotes: string | null
): void {
  const db = getDb();

  db.transaction(() => {
    db.prepare('DELETE FROM cards_fts WHERE card_id = ?').run(cardId);
    db.prepare(`
      INSERT INTO cards_fts(card_id, name, description, creator, creator_notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(cardId, name, description || '', creator || '', creatorNotes || '');
  })();
}

/**
 * Remove card from FTS index
 */
export function removeFtsIndex(cardId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM cards_fts WHERE card_id = ?').run(cardId);
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Helper for transactions
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDb();
  return database.transaction(fn)(database);
}

// Export row types
export interface CardRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  creator_notes: string | null;
  head_version_id: string | null;
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked';
  moderation_state: 'ok' | 'review' | 'blocked';
  upvotes: number;
  downvotes: number;
  favorites_count: number;
  downloads_count: number;
  comments_count: number;
  forks_count: number;
  uploader_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CardVersionRow {
  id: string;
  card_id: string;
  parent_version_id: string | null;
  forked_from_id: string | null;
  storage_url: string;
  content_hash: string;
  spec_version: string;
  source_format: string;
  tokens_description: number;
  tokens_personality: number;
  tokens_scenario: number;
  tokens_mes_example: number;
  tokens_first_mes: number;
  tokens_system_prompt: number;
  tokens_post_history: number;
  tokens_total: number;
  has_alt_greetings: number;
  alt_greetings_count: number;
  has_lorebook: number;
  lorebook_entries_count: number;
  has_embedded_images: number;
  embedded_images_count: number;
  has_assets: number;
  assets_count: number;
  saved_assets: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  thumbnail_path: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  card_data: string;
  created_at: number;
}

export interface CardWithVersionRow extends CardRow {
  version_id: string;
  storage_url: string;
  content_hash: string;
  spec_version: string;
  source_format: string;
  tokens_description: number;
  tokens_personality: number;
  tokens_scenario: number;
  tokens_mes_example: number;
  tokens_first_mes: number;
  tokens_system_prompt: number;
  tokens_post_history: number;
  tokens_total: number;
  has_alt_greetings: number;
  alt_greetings_count: number;
  has_lorebook: number;
  lorebook_entries_count: number;
  has_embedded_images: number;
  embedded_images_count: number;
  has_assets: number;
  assets_count: number;
  saved_assets: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  thumbnail_path: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  card_data: string;
  version_created_at: number;
  forked_from_version_id: string | null;
}

export interface TagRow {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  usage_count: number;
}

export interface UserRow {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  is_admin: number;
  provider: string | null;
  provider_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface VoteRow {
  user_id: string;
  card_id: string;
  vote: number;
  created_at: number;
}

export interface FavoriteRow {
  user_id: string;
  card_id: string;
  created_at: number;
}

export interface CommentRow {
  id: string;
  card_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}
