# Independent Code Review: Character Federation Platform
**Date:** December 9, 2025
**Reviewer:** Claude (Internal)

---

## Part 1: Security Analysis

### CRITICAL Security Issues

#### 1. **Unauthenticated R2 File Access** (`src/app/api/uploads/[...path]/route.ts`)
- **Location:** Lines 51-72
- **Issue:** When running on Cloudflare, if no `uploads` metadata row exists in the database, the code proceeds to fetch the object directly from R2 without any access control.
- **Impact:** Any R2 object key can be fetched without visibility checks if the `uploads` table doesn't have a matching entry. This means:
  - Private files can be leaked if metadata insertion fails
  - Key-guessing attacks possible across the entire bucket
  - Files uploaded before the `uploads` table was added have no access control
- **Severity:** CRITICAL

#### 2. **Non-Atomic Transactions on D1** (`src/lib/db/async-db.ts:122-127`)
- **Location:** `transaction()` method in D1 wrapper
- **Issue:** The transaction wrapper explicitly states in comments that D1 does NOT support atomic transactions - it simply executes the callback.
- **Impact:** Operations assumed to be atomic (votes, favorites, session creation, counter updates) can interleave under load, causing:
  - Vote/favorite count inconsistencies
  - Potential race conditions in user registration
  - Session state corruption
- **Severity:** HIGH

#### 3. **Client-Supplied Metadata Trust** (`src/app/api/cards/route.ts:462-472`)
- **Location:** POST handler, lines 462-472
- **Issue:** When `metadataJson` is provided by the client, it's parsed and used directly without full schema validation. The `CardUploadMetadataSchema` exists but isn't applied to the parsed metadata.
- **Impact:**
  - Clients can submit fake token counts
  - Content hashes can be spoofed
  - Visibility/tag combinations that should be rejected can be injected
- **Severity:** HIGH

#### 4. **In-Memory Rate Limiting** (`src/lib/rate-limit.ts`)
- **Location:** Entire file
- **Issue:** Rate limits are stored in a JavaScript `Map` in memory. On Cloudflare Workers, each isolate has its own memory space.
- **Impact:**
  - Attackers can bypass rate limits by hitting different isolates
  - Limits reset when isolates are evicted
  - False sense of security against brute-force attacks
- **Severity:** HIGH

### HIGH Security Issues

#### 5. **Session Cookies Lack CSRF Protection** (`src/app/api/auth/login/route.ts:43-48`)
- **Issue:** Session cookies are set with `SameSite: lax` but no CSRF tokens are implemented.
- **Impact:** Cross-site form POST attacks possible on state-changing endpoints.

#### 6. **Missing Security Headers**
- **Issue:** No global middleware sets CSP, HSTS, X-Frame-Options, etc.
- **Impact:** XSS and clickjacking vulnerabilities are easier to exploit.

#### 7. **Path Validation Only Applied Locally** (`src/app/api/uploads/[...path]/route.ts:79`)
- **Issue:** `safeResolveUploadPath` is only called in the local filesystem branch (line 79), not in the Cloudflare branch.
- **Impact:** Path traversal validation not applied to R2 keys.

### MEDIUM Security Issues

#### 8. **Weak Password Requirements** (`src/lib/validations/auth.ts:17-18`)
- **Issue:** Minimum password length is only 6 characters with no complexity requirements.
- **Impact:** Weak passwords are allowed.

#### 9. **Timing Attack on Login** (`src/lib/auth/index.ts:71-77`)
- **Issue:** Early return when user doesn't exist vs. when password is wrong creates timing difference.
- **Impact:** Username enumeration possible.

#### 10. **Profile CSS Injection** (`src/lib/db/schema.ts:11`)
- **Issue:** `profileCss` field allows arbitrary CSS - no sanitization visible.
- **Impact:** CSS injection for phishing or UI manipulation.

---

## Part 2: Architectural & Complexity Analysis

### Major Bottlenecks

#### 1. **"God Handler" in `POST /api/cards`** (`src/app/api/cards/route.ts`)
- **Size:** ~850 lines
- **Responsibilities:**
  1. Session authentication
  2. Input validation
  3. Format detection (Voxta vs. PNG vs. JSON vs. CharX)
  4. Parsing strategy selection with complex fallback logic
  5. Image processing (environment-dependent)
  6. Storage operations
  7. Database writes
  8. Collection handling
- **Problems:**
  - Code duplication for single-char Voxta handling (lines 493-531 and 552-597)
  - Deeply nested try/catch blocks
  - Mixed concerns make testing difficult
- **Recommendation:** Extract into Pipeline pattern: `Detector -> Parser -> AssetProcessor -> Storage -> Database`

#### 2. **Environment Bifurcation Pattern**
- **Locations:** `isCloudflareRuntime()` checks appear in:
  - `route.ts` (cards upload) - image processing
  - `thumb/route.ts` - thumbnail generation
  - `uploads/route.ts` - file serving
  - Storage drivers
- **Problem:** Two parallel code paths to maintain, bugs can exist in one environment but not the other.
- **Recommendation:** Use interface-based abstraction (`IImageService`, `IStorageService`) with dependency injection.

#### 3. **Drizzle ORM Not Fully Utilized**
- **Issue:** Drizzle schema is defined in `schema.ts` but all queries use raw SQL with `db.prepare()`.
- **Problem:**
  - No compile-time type safety for queries
  - Schema refactoring won't catch query breaks
  - Defeats the purpose of having an ORM
- **Recommendation:** Migrate to Drizzle Query Builder for type-safe queries.

### Code Duplication

#### 1. **Card Data Mapping** (`src/lib/db/cards.ts`)
- Similar mapping logic appears in:
  - `getCards()` - lines 186-229
  - `getCardBySlug()` - lines 279-307
  - `getCardsByIds()` - lines 888-926
- **Recommendation:** Extract to shared `mapRowToCardListItem()` helper.

#### 2. **Voxta Parsing Logic** (`src/app/api/cards/route.ts`)
- `tryVoxtaParsing` closure (lines 414-451)
- Duplicate single-char handling (lines 493-531 and 552-597)
- **Recommendation:** Extract to `VoxtaParser` service class.

#### 3. **Visibility Check Logic**
- Similar visibility checks in:
  - `uploads/route.ts` - lines 39-47
  - `cards/[slug]/download/route.ts` - lines 17-37
  - `collections/[slug]/route.ts` (implied)
- **Recommendation:** Centralize in `VisibilityService.canAccess(resource, user)`.

### Missing Abstractions

1. **No Service Layer** - Business logic lives in API routes
2. **No Repository Pattern** - Direct database access everywhere
3. **No Event System** - Actions are tightly coupled (no hooks for federation)
4. **No Queue Abstraction** - Only Cloudflare Queues planned, VPS users left behind

---

## Part 3: Federation Readiness

### Current State
- Project named "federation" but schema is single-tenant monolith
- No `actor_id`, `remote_url`, or signature columns
- No ActivityPub-related tables (actors, activities, follows/subscribers)
- No inbox/outbox model

### Missing for Federation
1. **Identity Separation:** Need `actors` table separate from `users`
2. **Activity Log:** Append-only log for sync ("what changed since X?")
3. **HTTP Signatures:** For verifying federated requests
4. **Per-tenant Namespaces:** IDs will collide across nodes

---

## Part 4: PM/UX Impact Summary

| Issue | Time-to-Feature Impact | Bug Risk |
|-------|----------------------|----------|
| God Handler | +50% for new formats | High |
| Env Bifurcation | +30% maintenance | Medium |
| In-memory Rate Limits | N/A | High (false security) |
| No Service Layer | +40% onboarding time | Medium |
| Raw SQL Queries | N/A | High (refactor risk) |

---

## Part 5: Recommended Actions (Priority Order)

### Immediate (Security)
1. Gate R2 reads on validated paths + existing metadata; return 403 when missing
2. Switch rate limiting to Cloudflare KV or D1-backed
3. Add CSRF tokens to state-changing endpoints
4. Validate/recompute all client-provided upload metadata server-side

### Short-term (Architecture)
5. Extract `CardIngestionService` from upload route
6. Abstract image processing behind interface
7. Replace raw SQL with Drizzle Query Builder
8. Centralize visibility logic

### Medium-term (Scalability)
9. Add search indexing (FTS5 or Meilisearch) before 10k+ cards
10. Define federation data model before further feature work
11. Create abstraction layers for VPS deployment (Queue, Storage, Database interfaces)

---

## Component Quality Assessment

### Well-Designed
- **Storage abstraction** (`src/lib/storage/`) - Good interface, extensible
- **Validation schemas** (`src/lib/validations/`) - Comprehensive Zod schemas
- **Component structure** (`src/components/`) - Clean separation, reusable UI components
- **Logging infrastructure** (`src/lib/logger.ts`) - Environment-aware, structured

### Needs Improvement
- **Database layer** - Raw SQL defeats ORM benefits
- **API routes** - Too much business logic
- **Auth module** - Hand-rolled, should use established library
- **Rate limiting** - In-memory doesn't work for serverless
