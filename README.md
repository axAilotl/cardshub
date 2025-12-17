# Character Federation

![Gemini_Generated_Image_80fvtz80fvtz80fv](https://github.com/user-attachments/assets/662d9e5a-1c68-4a67-814b-53e6b27b3901)

A platform for sharing, discovering, and managing AI character cards. Supports CCv2, CCv3, CharX, and Voxta formats.


**Live DEMO (wiped often):** https://hub.axailotl.ai

## Features

- **Multi-format support** - PNG, JSON, CharX (.charx), Voxta (.voxpkg)
- **Large uploads** - Direct-to-R2 uploads via presigned URLs (avoid Worker body limits)
- **Full-text search** - Uses FTS when available (falls back when tables are missing)
- **Tag system** - Auto-extracted from card data with include/exclude filtering
- **User interactions** - Voting, favorites, comments, reporting
- **Asset previews (optional)** - Sample preview assets for cards with large packages (admin gated)
- **Admin panel** - Moderation, visibility controls, user management
- **WebP thumbnails** - Cloudflare Image Transformations for optimized delivery
- **Personalized feed** - Content from followed users and tags, plus trending
- **Social features** - Follow users, follow/block tags, user profiles with bio
- **Privacy controls** - Public, private, and unlisted visibility on uploads

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Database:** SQLite (better-sqlite3 local, Cloudflare D1 production)
- **Storage:** Local filesystem / Cloudflare R2
- **Auth:** Cookie-based sessions with bcrypt
- **Validation:** Zod schemas
- **Testing:** Vitest
- **Styling:** Tailwind CSS v4

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database
npm run db:reset

# Start dev server
npm run dev # runs on http://localhost:3001
```

## Deployment

### Cloudflare Workers

```bash
# Build and deploy
npm run cf:build && npm run cf:deploy

# Create D1 database (first time)
npm run cf:d1:create
npm run cf:d1:migrate

# Create R2 bucket (first time)
npm run cf:r2:create

# Deploy dev environment
npm run cf:deploy:dev
```

### Environment Variables

```bash
# Local development
ALLOW_AUTO_ADMIN=true          # Enable admin bootstrap
ADMIN_BOOTSTRAP_PASSWORD=xxx   # Bootstrap password
DATABASE_PATH=./cardshub.db    # SQLite database path

# Production (Cloudflare secrets)
DISCORD_CLIENT_ID=xxx          # Discord OAuth
DISCORD_CLIENT_SECRET=xxx

# Optional - Presigned uploads (direct R2 upload, bypasses Worker memory)
R2_ACCESS_KEY_ID=xxx           # R2 API token access key
R2_SECRET_ACCESS_KEY=xxx       # R2 API token secret key
CLOUDFLARE_ACCOUNT_ID=xxx      # Account ID for R2 S3 endpoint

# Optional
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### R2 CORS (browser uploads)

Presigned uploads are **cross-origin** `PUT`s from your site → the R2 S3 endpoint. Configure the bucket CORS rules to allow your origins and `PUT`.

Example:

```json
[{
  "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001", "https://hub-dev.axailotl.ai"],
  "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Run tests (watch) |
| `npm run test:run` | Run tests (once) |
| `npm run lint` | ESLint |
| `npm run db:reset` | Reset database |
| `npm run admin:reset-pw <user> <pass>` | Reset user password |
| `npm run cf:deploy` | Deploy to Cloudflare |

## API

See [CLAUDE.md](./CLAUDE.md) for full API documentation.

### Key Endpoints

- `GET /api/cards` - List cards with filtering
- `POST /api/cards` - Upload card (auth required)
- `POST /api/uploads/presign` - Get presigned URLs for direct R2 upload
- `POST /api/uploads/confirm` - Confirm presigned upload
- `GET /api/cards/[slug]/download?format=png|json|original` - Download card
- `PUT /api/cards/[slug]/visibility` - Update card visibility (owner only)
- `GET /api/search?q=query` - Full-text search
- `GET /api/tags` - List tags by category
- `GET /api/feed` - Personalized feed (followed users/tags + trending)
- `GET /api/users/me/tags` - User tag preferences (follow/block)

## Troubleshooting

### Production broken after schema change
Schema changes in `schema.sql` are NOT auto-applied to D1. Run migrations manually:
```bash
npx wrangler d1 execute cardshub-db --remote --command "ALTER TABLE cards ADD COLUMN new_column TEXT"
```

### D1_ERROR: no such table: cards_fts / collections_fts
Some older D1 databases were created without the FTS virtual tables. Create + backfill them:

```bash
# Dev D1 (recommended first)
npx wrangler d1 execute cardshub-db-dev --env dev --remote --command "CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(card_id UNINDEXED, name, description, creator, creator_notes, tokenize='porter unicode61 remove_diacritics 1')"
npx wrangler d1 execute cardshub-db-dev --env dev --remote --command "CREATE VIRTUAL TABLE IF NOT EXISTS collections_fts USING fts5(collection_id UNINDEXED, name, description, creator, tokenize='porter unicode61 remove_diacritics 1')"
npx wrangler d1 execute cardshub-db-dev --env dev --remote --command "DELETE FROM cards_fts; INSERT INTO cards_fts(card_id, name, description, creator, creator_notes) SELECT id, name, COALESCE(description,''), COALESCE(creator,''), COALESCE(creator_notes,'') FROM cards"
npx wrangler d1 execute cardshub-db-dev --env dev --remote --command "DELETE FROM collections_fts; INSERT INTO collections_fts(collection_id, name, description, creator) SELECT id, name, COALESCE(description,''), COALESCE(creator,'') FROM collections"
```

### API works locally but fails on Cloudflare
- Don't use generated columns in queries (use inline calculations)
- Check if schema was migrated to D1

### Push doesn't update production
Deployment is manual: `npm run cf:build && npm run cf:deploy`

### Tests fail with missing fixtures
Some test suites require the golden fixtures directory. Either set it:

```bash
export CF_FIXTURES_DIR=/path/to/fixtures
```

…or skip those suites:

```bash
CF_ALLOW_MISSING_FIXTURES=1 npm run test:run
```

### Browser crashes with `createRequire is not a function`
Update `@character-foundry/*` packages - older versions bundled fflate's Node.js code:
```bash
npm update @character-foundry/core @character-foundry/png @character-foundry/charx @character-foundry/voxta
```
Verify fix: `grep -l "createRequire" node_modules/@character-foundry/*/dist/*` should return nothing.

## License

MIT
