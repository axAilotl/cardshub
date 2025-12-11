# CardsHub Improvement Plan

**Created:** December 9, 2025
**Status:** Draft - Pending Review

---

## Overview

This document outlines the phased improvement plan for the CardsHub codebase, addressing security vulnerabilities, architectural debt, and federation readiness identified in the code reviews.

### Guiding Principles
1. **No shortcuts** - No `any` types, no skipped validations
2. **Upstream first** - Package improvements go to `@character-foundry/*` repos before refactoring
3. **Test-driven** - Each change has corresponding tests before and after
4. **Incremental** - Small, reviewable PRs over large rewrites

---

## Package Dependency Analysis

### Current Versions
| Package | Installed | Latest | Action |
|---------|-----------|--------|--------|
| `@character-foundry/loader` | 0.1.3 | **0.1.4** | **Upgrade** |
| `@character-foundry/voxta` | 0.1.1 | 0.1.2 | Upgrade (loader dep) |
| `@character-foundry/png` | 0.0.1 | 0.0.2 | Upgrade (loader dep) |
| `@character-foundry/federation` | 0.1.1 | 0.1.1 | **USE IT** (currently unused!) |
| `@character-foundry/core` | 0.0.1 | 0.0.1 | **USE ERROR TYPES** |
| `@character-foundry/schemas` | 0.0.1 | 0.0.1 | Use detection utilities |

### Unused Package Features (Quick Wins)

#### 1. `@character-foundry/core` - Error Types
**Currently unused.** Package exports:
- `ParseError` - Use instead of generic Error in parsing
- `ValidationError` - Use in API validation
- `FormatNotSupportedError` - Use in upload handler
- `SizeLimitError` - Use in file size checks
- `PathTraversalError` - Use in path validation
- `isFoundryError()` / `wrapError()` - Use in error handling

#### 2. `@character-foundry/schemas` - Detection Utilities
**Currently unused.** Package exports:
- `detectSpec()` - Use instead of manual spec detection
- `looksLikeCard()` - Use for preliminary validation
- `hasLorebook()` - Use instead of manual check

#### 3. `@character-foundry/federation` - Federation Infrastructure
**Currently unused despite being installed!** Package exports:
- `FederatedActor`, `FederatedCard` types
- `SyncEngine` with platform adapters
- `SillyTavernAdapter` - Ready for ST integration
- Route handlers: `handleWebFinger`, `handleNodeInfo`, `handleActor`
- **NOTE:** Package has security warning - signature validation stubbed

---

## Required Upstream Issues (Draft Before Refactoring)

### Issue #1: Add D1-compatible SyncStateStore to federation package

**Repository:** character-foundry/federation
**Type:** Feature Request

**Description:**
The current `SyncStateStore` implementations (Memory, File, LocalStorage) don't work with Cloudflare D1. Need a D1-compatible implementation for production federation support.

**Proposed API:**
```typescript
export class D1SyncStateStore implements SyncStateStore {
  constructor(db: D1Database) {}
  // ... implements SyncStateStore interface
}
```

**Use Case:** CardsHub needs to store federation sync state in D1 for Cloudflare deployment.

---

### Issue #2: Export token counting utilities from loader or create new package

**Repository:** character-foundry/loader (or new package)
**Type:** Feature Request

**Description:**
CardsHub has its own token counting implementation using tiktoken. This should be standardized in the ecosystem to ensure consistent token counts across platforms.

**Current CardsHub Implementation:** `src/lib/card-parser/token-counter.ts`

**Proposed:**
Either:
1. Add `countTokens(card: CCv3Data): TokenCounts` to loader
2. Create `@character-foundry/tokenizer` package

---

### Issue #3: Add server-side metadata validation to loader

**Repository:** character-foundry/loader
**Type:** Enhancement

**Description:**
When a client provides pre-parsed metadata (for optimistic UI), the server needs to validate and recompute certain fields. Need utility function:

```typescript
export interface ServerValidationResult {
  isValid: boolean;
  computedTokens: TokenCounts;
  computedHash: string;
  warnings: string[];
}

export function validateClientMetadata(
  clientMetadata: unknown,
  actualCard: CCv3Data,
  rawBuffer: BinaryData
): ServerValidationResult;
```

---

### Issue #4: Add ImageService abstraction to core or new package

**Repository:** character-foundry/core (or new package)
**Type:** Feature Request

**Description:**
CardsHub has environment-dependent image processing (`sharp` for Node.js, Cloudflare Images binding for Workers). Need abstraction:

```typescript
export interface ImageService {
  resize(input: BinaryData, options: ResizeOptions): Promise<BinaryData>;
  toWebP(input: BinaryData, quality?: number): Promise<BinaryData>;
  getInfo(input: BinaryData): Promise<ImageInfo>;
}

export function createImageService(env: 'node' | 'cloudflare'): ImageService;
```

---

### Issue #5: Complete HTTP signature validation in federation package

**Repository:** character-foundry/federation
**Type:** Security

**Description:**
The federation package has a security warning that signature validation is stubbed. Before CardsHub can use the route handlers in production, this must be completed:

1. `validateActivitySignature()` currently returns `true` always
2. Inbox handler doesn't verify signatures
3. No key rotation support

**Blocking:** CardsHub federation feature

---

## Phase 1: Critical Security (Week 1)

### 1.1 R2 File Access Control

**Problem:** `src/app/api/uploads/[...path]/route.ts` skips visibility checks on Cloudflare/R2 branch when no metadata row exists.

**Solution:**
1. Always check `uploads` table for metadata
2. Fail-closed: return 403 if metadata missing
3. Apply path validation to R2 keys (not just local filesystem)

**Test Plan:**
```
tests/api/uploads/
├── access-control.test.ts
│   ├── should return 403 for missing metadata
│   ├── should return 403 for private files without auth
│   ├── should return 200 for public files
│   ├── should return 200 for private files with valid session
│   └── should reject path traversal attempts on R2
└── visibility-enforcement.test.ts
    ├── should check visibility before serving file
    ├── should verify access token for unlisted files
    └── should allow admin access to all files
```

**Files to Modify:**
- `src/app/api/uploads/[...path]/route.ts`
- `src/app/api/uploads/utils.ts` (add R2 path validation)

---

### 1.2 Rate Limiting Migration

**Problem:** In-memory `Map` doesn't persist across Cloudflare Worker isolates.

**Solution:** Create KV-backed rate limiter for Cloudflare, keep in-memory for local dev.

**Implementation:**
```typescript
// src/lib/rate-limit/index.ts
export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

// src/lib/rate-limit/memory.ts
export class MemoryRateLimiter implements RateLimiter { ... }

// src/lib/rate-limit/kv.ts
export class KVRateLimiter implements RateLimiter { ... }

// Factory
export function createRateLimiter(): RateLimiter {
  if (isCloudflare()) {
    return new KVRateLimiter();
  }
  return new MemoryRateLimiter();
}
```

**Test Plan:**
```
tests/lib/rate-limit/
├── memory-limiter.test.ts
│   ├── should allow requests under limit
│   ├── should block requests over limit
│   └── should reset after window expires
├── kv-limiter.test.ts
│   ├── should persist across calls
│   ├── should handle KV failures gracefully
│   └── should use atomic increments
└── integration.test.ts
    ├── should rate limit login endpoint
    └── should rate limit register endpoint
```

**Files to Create/Modify:**
- `src/lib/rate-limit/index.ts` (refactor)
- `src/lib/rate-limit/memory.ts` (extract)
- `src/lib/rate-limit/kv.ts` (new)
- `wrangler.toml` (add KV binding)

---

### 1.3 Client Metadata Server Validation

**Problem:** When client sends pre-parsed metadata, server trusts it without validation.

**Solution:** Always recompute critical fields server-side.

**Implementation:**
```typescript
// src/lib/card-parser/server-validation.ts
export interface ServerValidatedMetadata {
  tokens: TokenCounts;          // Always recomputed
  contentHash: string;          // Always recomputed
  tags: string[];              // Validated against policy
  visibility: string;          // Validated against policy
  isClientMetadataTrusted: boolean;
}

export function validateAndRecomputeMetadata(
  clientMetadata: CardUploadMetadata | null,
  parseResult: ParseResult,
  rawBuffer: Buffer
): ServerValidatedMetadata;
```

**Test Plan:**
```
tests/lib/card-parser/server-validation.test.ts
├── should recompute token counts even if client provides them
├── should recompute content hash even if client provides it
├── should reject invalid tag combinations
├── should reject disallowed visibility values
├── should flag when client metadata differs from computed
└── should work without client metadata (server-only parse)
```

**Files to Modify:**
- `src/app/api/cards/route.ts` (use validation)
- `src/lib/card-parser/server-validation.ts` (new)

---

### 1.4 CSRF Protection

**Problem:** Session cookies use `SameSite: lax` but no CSRF tokens.

**Solution:** Add CSRF token to session, verify on state-changing requests.

**Implementation:**
```typescript
// src/lib/auth/csrf.ts
export function generateCsrfToken(): string;
export function validateCsrfToken(request: NextRequest, session: Session): boolean;

// Middleware pattern
export function withCsrf(handler: NextHandler): NextHandler;
```

**Test Plan:**
```
tests/lib/auth/csrf.test.ts
├── should generate unique tokens
├── should reject requests without token
├── should reject requests with invalid token
├── should accept requests with valid token
└── should work with JSON and form submissions
```

---

### 1.5 Security Headers Middleware

**Problem:** No CSP, HSTS, X-Frame-Options set globally.

**Solution:** Add Next.js middleware for security headers.

**Implementation:**
```typescript
// src/middleware.ts
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; ...",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
```

**Test Plan:**
```
tests/middleware/security-headers.test.ts
├── should set CSP header
├── should set HSTS header
├── should set X-Frame-Options header
└── should allow configured exceptions
```

---

## Phase 2: Architecture Improvements (Weeks 2-3)

### 2.1 Extract CardIngestionService

**Problem:** `POST /api/cards` is 850+ lines with 7+ responsibilities.

**Solution:** Pipeline pattern with discrete stages.

**Architecture:**
```
src/lib/services/card-ingestion/
├── index.ts                 # CardIngestionService facade
├── pipeline.ts              # Pipeline orchestrator
├── stages/
│   ├── detector.ts          # Format detection (use @character-foundry/loader)
│   ├── parser.ts            # Card parsing
│   ├── validator.ts         # Server-side validation
│   ├── asset-processor.ts   # Image/asset handling
│   ├── storage.ts           # Save to R2/filesystem
│   └── database.ts          # Insert records
└── types.ts                 # Internal types
```

**Test Plan:**
```
tests/lib/services/card-ingestion/
├── detector.test.ts
├── parser.test.ts
├── validator.test.ts
├── asset-processor.test.ts
├── storage.test.ts
├── database.test.ts
├── pipeline.test.ts
└── integration.test.ts
```

**API Route After:**
```typescript
// src/app/api/cards/route.ts (~50 lines)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const rl = await applyRateLimit(getClientId(request), 'upload');
  if (!rl.allowed) return rateLimited(rl);

  const formData = await request.formData();
  const file = formData.get('file') as File;

  const service = getCardIngestionService();
  const result = await service.ingest(file, {
    uploaderId: session.user.id,
    visibility: formData.get('visibility') as string,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ card: result.card });
}
```

---

### 2.2 Image Processing Abstraction

**Problem:** `isCloudflareRuntime()` checks scattered through codebase.

**Solution:** Interface with environment-specific implementations.

**Architecture:**
```
src/lib/image/
├── index.ts                 # Factory and exports
├── interface.ts             # IImageService interface
├── node-service.ts          # Sharp implementation
├── cloudflare-service.ts    # IMAGES binding implementation
└── types.ts
```

**Interface:**
```typescript
export interface IImageService {
  resize(input: Buffer, options: ResizeOptions): Promise<Buffer>;
  toWebP(input: Buffer, quality?: number): Promise<Buffer>;
  toThumbnail(input: Buffer, config: ThumbnailConfig): Promise<Buffer>;
  getInfo(input: Buffer): Promise<ImageInfo>;
}
```

**Test Plan:**
```
tests/lib/image/
├── node-service.test.ts
│   ├── should resize image maintaining aspect ratio
│   ├── should convert to WebP
│   └── should generate thumbnail
├── cloudflare-service.test.ts (mocked)
└── integration.test.ts
```

---

### 2.3 Visibility Service Centralization

**Problem:** Visibility checks duplicated across uploads route, download route, cards queries.

**Solution:** Single `VisibilityService` with consistent logic.

**Architecture:**
```
src/lib/services/visibility/
├── index.ts
└── visibility-service.ts
```

**API:**
```typescript
export interface VisibilityContext {
  userId?: string;
  isAdmin: boolean;
}

export class VisibilityService {
  canView(resource: { visibility: string; ownerId?: string }, ctx: VisibilityContext): boolean;
  canDownload(resource: { visibility: string; ownerId?: string }, ctx: VisibilityContext): boolean;
  canEdit(resource: { ownerId?: string }, ctx: VisibilityContext): boolean;
  getVisibleVisibilities(ctx: VisibilityContext): string[];
}
```

---

### 2.4 Drizzle ORM Migration

**Problem:** Raw SQL queries defeat type safety.

**Solution:** Incremental migration to Drizzle Query Builder.

**Approach:**
1. Create typed query helpers alongside raw SQL
2. Test that both return identical results
3. Replace raw SQL one function at a time
4. Remove raw SQL after validation

**Example Migration:**
```typescript
// Before
const rows = await db.prepare(`
  SELECT * FROM cards WHERE visibility = ?
`).all('public');

// After
const rows = await db.select().from(cards).where(eq(cards.visibility, 'public'));
```

**Test Plan:**
```
tests/lib/db/migration/
├── cards-queries.test.ts
│   └── should return identical results for raw vs typed queries
└── users-queries.test.ts
```

---

## Phase 3: Federation Foundation (Weeks 4-5)

### 3.1 Use Existing Federation Package

**Problem:** `@character-foundry/federation` is installed but unused.

**Solution:** Integrate existing infrastructure.

**Tasks:**
1. Create D1-compatible `SyncStateStore` (see Issue #1)
2. Implement `PlatformAdapter` for CardsHub
3. Add federation routes (WebFinger, NodeInfo, Actor)
4. Add `actors` table to schema

**Schema Addition:**
```sql
CREATE TABLE actors (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'Person',
  preferred_username TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  outbox_url TEXT NOT NULL,
  public_key_pem TEXT,
  private_key_pem TEXT,  -- encrypted
  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES actors(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  published_at INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);
```

---

### 3.2 Queue Abstraction

**Problem:** No queue abstraction for background jobs.

**Solution:** Interface with CF Queues and BullMQ implementations.

**Architecture:**
```
src/lib/queue/
├── index.ts
├── interface.ts
├── cloudflare-queue.ts
├── bullmq-queue.ts
└── memory-queue.ts (for testing)
```

---

## Testing Strategy

### Test Categories

| Category | Location | Runner | Coverage Target |
|----------|----------|--------|-----------------|
| Unit | `tests/lib/**/*.test.ts` | Vitest | 80%+ |
| Integration | `tests/api/**/*.test.ts` | Vitest | 70%+ |
| E2E | `tests/e2e/**/*.test.ts` | Playwright (future) | Critical paths |

### Security Test Suite

```
tests/security/
├── r2-access.test.ts       # R2 visibility enforcement
├── path-traversal.test.ts  # Path validation
├── csrf.test.ts            # CSRF protection
├── rate-limit.test.ts      # Rate limiting effectiveness
├── auth-timing.test.ts     # Timing attack resistance
└── input-validation.test.ts # Zod schema enforcement
```

### Test Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run security tests only
npm test -- tests/security/

# Run specific phase tests
npm test -- tests/lib/rate-limit/
```

---

## Migration Checklist

### Pre-Phase 1
- [ ] File upstream issues (5 issues)
- [ ] Upgrade `@character-foundry/loader` to 0.1.4
- [ ] Update dependencies (`npm update`)

### Phase 1 Completion Criteria
- [ ] R2 access control tests pass
- [ ] KV rate limiter deployed
- [ ] Client metadata recomputed server-side
- [ ] CSRF tokens implemented
- [ ] Security headers in place
- [ ] No `any` types introduced

### Phase 2 Completion Criteria
- [ ] CardIngestionService extraced
- [ ] API route < 100 lines
- [ ] No `isCloudflareRuntime()` in business logic
- [ ] VisibilityService used everywhere
- [ ] 50%+ of raw SQL converted to Drizzle

### Phase 3 Completion Criteria
- [ ] Federation routes responding
- [ ] Actors table populated
- [ ] SillyTavern adapter tested
- [ ] Queue abstraction working

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes during refactor | Feature flags, incremental rollout |
| Cloudflare-specific bugs | Parallel local + CF testing |
| Federation security | Keep experimental flag, staged rollout |
| Performance regression | Baseline metrics before changes |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| API route LOC (cards POST) | ~850 | < 100 |
| Test coverage | ~30% | 70%+ |
| `isCloudflareRuntime()` calls | ~15 | 0 (in business logic) |
| Raw SQL queries | ~95% | < 20% |
| Security vulnerabilities | 5 critical | 0 |

---

## Appendix: GitHub Issue Templates

### Template for Package Issues

```markdown
## Summary
[One-line description]

## Background
[Why this is needed, link to CardsHub improvement plan]

## Proposed API
```typescript
// Code example
```

## Use Cases
1. [Use case 1]
2. [Use case 2]

## Alternatives Considered
[What else was considered]

## Additional Context
[Any other relevant info]
```
