# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CardsHub is a platform for sharing, discovering, and managing AI character cards (CCv2/CCv3 format). It's a clone of Wyvern.chat's explore functionality built with Next.js 15.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: better-sqlite3 with WAL mode
- **Tokenizer**: tiktoken (cl100k_base encoding for GPT-4 compatible counts)
- **Styling**: Tailwind CSS v4 with CSS-in-JS theme configuration
- **Storage**: Abstracted with URL schemes (`file://`, future: `s3://`, `ipfs://`)
- **Runtime**: Node.js 22
- **Auth**: Cookie-based sessions with SHA256 password hashing

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

### Core Domain Model

```
┌──────────────────┐         ┌─────────────────────┐
│      Card        │ 1:N     │    CardVersion      │
│   (identity)     │────────→│ (immutable snapshot)│
├──────────────────┤         ├─────────────────────┤
│ id, slug         │         │ id                  │
│ author_id        │         │ card_id             │
│ title, summary   │         │ parent_version_id   │ ← previous edit
│ visibility       │         │ forked_from_id      │ ← derivative source
│ head_version_id ─┼────────→│ storage_url         │
│ stats (denorm)   │         │ content_hash        │
└──────────────────┘         │ token counts        │
                             │ metadata flags      │
                             └─────────────────────┘
```

**Key Concepts:**
1. **Card** = logical identity (stable URL, ownership, stats)
2. **CardVersion** = immutable snapshot (content, tokens, metadata)
3. **Storage** = abstracted blob store (file:// for MVP)

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/cards/          # Card CRUD, download, vote, favorite, comment endpoints
│   ├── api/auth/           # Login, logout, register, session endpoints
│   ├── api/admin/          # Admin-only endpoints (stats, cards, reports, users)
│   ├── api/users/          # User profiles and favorites
│   ├── api/search/         # Full-text search endpoint
│   ├── api/tags/           # Tags listing
│   ├── api/uploads/        # Static file serving
│   ├── admin/              # Admin panel pages (dashboard, cards, reports, users)
│   ├── explore/            # Main grid view with filtering
│   ├── card/[slug]/        # Card detail page
│   ├── user/[username]/    # User profile page
│   ├── upload/             # Card upload page
│   ├── login/              # Login/register page
│   └── settings/           # User settings page
├── components/
│   ├── ui/                 # Base components (Button, Input, Modal, Badge)
│   ├── layout/             # AppShell, Header, Sidebar
│   └── cards/              # CardGrid, CardItem, CardFilters, CardModal
├── lib/
│   ├── auth/               # Authentication (login, register, sessions, context)
│   ├── db/                 # SQLite connection, schema, card operations, FTS5
│   ├── storage/            # Storage abstraction (file:// driver)
│   ├── card-parser/        # PNG parsing, CCv2/v3 spec, tokenizer
│   └── utils/              # cn(), generateSlug(), generateId()
└── types/                  # TypeScript interfaces for cards, users, API
```

### Color System - Bisexual Dark Mode (CSS Variables)
```css
--deep-space: #141414;    /* Primary background - dark */
--cosmic-teal: #1a1a1a;   /* Secondary background - slightly lighter */
--starlight: #F8FAFC;     /* Primary text - light */
--nebula: #5014a0;        /* Primary accent - bisexual purple */
--aurora: #7814a0;        /* Secondary accent - lighter purple */
--solar: #6428a0;         /* Warnings - muted purple */
--purple-deep: #3c14a0;   /* Deeper purple variant */
--purple-mid: #6414a0;    /* Mid purple variant */
```

### Visibility States
```
public      → visible to everyone
nsfw_only   → visible only with NSFW filter enabled
unlisted    → direct link only, not in search/browse
blocked     → admin removed, only admins see
```

### Character Card Parsing
The `lib/card-parser/` module handles:
- PNG tEXt chunk extraction (base64-encoded JSON in "chara" field)
- CCv2 spec parsing (`chara_card_v2`)
- CCv3 spec parsing (`chara_card_v3`) with assets support
- CharX package extraction (.charx ZIP files with card.json + assets/)
- Voxta package extraction (.voxpkg ZIP files)
- Token counting using tiktoken
- Metadata detection (alt greetings, lorebook, embedded images)
- Handles malformed JSON with trailing garbage data
- Binary asset extraction with `parseFromBufferWithAssets()`

### Storage Abstraction
The `lib/storage/` module provides:
- URL-based storage references (`file:///path`, future: `s3://bucket/key`, `ipfs://Qm...`)
- Pluggable driver architecture
- Content hashing for deduplication
- Currently only `file://` driver is implemented

### Asset Storage
- Extracted assets saved to `uploads/assets/{cardId}/`
- Thumbnails auto-generated for image assets (300px WebP)
- Asset metadata stored in `saved_assets` JSON column on card_versions
- Supports images, audio, and custom asset types
- Max upload size: 300MB (for large CharX/Voxta packages)

### Tag System
- Tags are extracted directly from the card's embedded tags field
- Tags are created automatically if they don't exist in the database
- Tag slugs are normalized (lowercase, hyphenated)
- Original tag names are preserved for display

### Database Schema
SQLite database (`cardshub.db`) with tables:
- `cards` - Card identity with stats, visibility, head_version_id pointer
- `card_versions` - Immutable version snapshots with token counts, storage_url, content_hash
- `tags` - Tag definitions with categories and usage counts
- `card_tags` - Many-to-many relationship
- `users` - User accounts with password hashes and admin flag
- `sessions` - Cookie-based session storage
- `votes`, `favorites`, `comments`, `downloads` - User interactions
- `reports` - Moderation reports

### API Endpoints

**Cards**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/cards | No | List cards (paginated, filtered by tags, sorted) |
| POST | /api/cards | No* | Upload new card (PNG/JSON/CharX/Voxta) |
| GET | /api/cards/[slug] | No | Get single card with head version |
| DELETE | /api/cards/[slug] | Yes | Delete card (admin only) |
| GET | /api/cards/[slug]/download | No | Download card as PNG or JSON |
| GET | /api/cards/[slug]/versions | No | Get version history |
| POST | /api/cards/[slug]/vote | Yes | Vote on card (1 or -1) |
| DELETE | /api/cards/[slug]/vote | Yes | Remove vote |
| POST | /api/cards/[slug]/favorite | Yes | Toggle favorite |
| GET | /api/cards/[slug]/favorite | No | Check if favorited |
| GET | /api/cards/[slug]/comments | No | Get comments |
| POST | /api/cards/[slug]/comments | Yes | Add comment |
| POST | /api/cards/[slug]/report | Yes | Report card for moderation |

**Search & Tags**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/search | No | Full-text search with BM25 ranking and snippets |
| GET | /api/tags | No | List all tags grouped by category |

**Users**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/users/[username] | No | Get public user profile |
| GET | /api/users/[username]/cards | No | Get cards uploaded by user |
| GET | /api/users/[username]/favorites | No | Get user's favorited cards |
| GET | /api/users/me | Yes | Get current user's profile |
| PUT | /api/users/me | Yes | Update current user's profile |

**Auth**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register new user account |
| POST | /api/auth/login | No | Login with username/password |
| POST | /api/auth/logout | Yes | Logout and clear session |
| GET | /api/auth/session | No | Get current session |

**Admin (requires admin role)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/stats | Dashboard statistics |
| GET | /api/admin/cards | Paginated cards with filters |
| DELETE | /api/admin/cards/[cardId] | Delete card |
| PUT | /api/admin/cards/[cardId]/visibility | Update visibility |
| PUT | /api/admin/cards/[cardId]/moderation | Update moderation state |
| PUT | /api/admin/cards/bulk | Bulk update cards |
| GET | /api/admin/reports | Paginated reports |
| PUT | /api/admin/reports/[reportId] | Update report status |
| GET | /api/admin/users | Paginated users |
| DELETE | /api/admin/users/[userId] | Delete user |
| PUT | /api/admin/users/[userId]/admin | Toggle admin status |

### Authentication
- Test admin account: username `admin`, password `password`
- User registration: POST `/api/auth/register` with username (3-20 chars, alphanumeric + underscore/hyphen) and password (min 6 chars)
- Sessions stored in SQLite with 30-day expiry
- Passwords hashed with SHA-256 (use bcrypt in production)
- Admin users can delete any card and manage users
- Auth context available via `useAuth()` hook

### Key Patterns
- Client components use `'use client'` directive with `useSearchParams` wrapped in Suspense
- API routes use async params: `{ params }: { params: Promise<{ slug: string }> }`
- Database operations are synchronous (better-sqlite3)
- Images served via API route that reads from `uploads/` directory
- Creator notes support both HTML and markdown images
- Uploads create both Card and CardVersion records atomically

### Full-Text Search (FTS5)
- Uses SQLite FTS5 virtual table `cards_fts` for fast search
- Indexes: name, description, creator, creator_notes
- Porter stemming + unicode61 tokenizer with diacritic removal
- BM25 ranking with configurable weights (name:10, description:5, creator:2, notes:1)
- Prefix matching for autocomplete (`"word"*`)
- Snippet generation with `<mark>` highlighting
- Auto-populated on startup, updated on card create/delete
- Fallback to LIKE search for single characters

### Admin Panel
- `/admin` - Dashboard with stats (cards, users, downloads, pending reports)
- `/admin/cards` - Cards management with visibility/moderation controls, bulk actions
- `/admin/reports` - Reports queue with status management
- `/admin/users` - User management with admin toggle

## Remaining Work (P2-P3)
- OAuth providers (Google, Discord, GitHub)
- Card editing (creates new CardVersion, preserves history)
- Card forking (creates new Card with forked_from_version_id)
- S3/IPFS storage drivers
- Bulk card upload
