# Gemini Code Review Findings (Updated)

## 🛑 Critical Findings (Still Present)

### 1. Database Incompatibility (Sync vs. Async)
*   **Status:** ❌ **NOT FIXED**
*   **Issue:** `src/lib/db/cards.ts` still uses synchronous `better-sqlite3` methods (`db.prepare(...).run(...)`).
*   **Impact:** The application **will fail** on Cloudflare D1 (which is async-only).
*   **Workaround:** Application works for local development. An async wrapper (`src/lib/db/async-db.ts`) has been created but the full migration of cards.ts is pending.
*   **Required Action:** Convert all functions in `src/lib/db/cards.ts` to be async using the wrapper in `async-db.ts`.

### 2. Missing R2 Storage Driver Registration
*   **Status:** ⚠️ **PARTIALLY MITIGATED**
*   **Issue:** `src/lib/storage/index.ts` only registers `FileStorageDriver`, not `R2StorageDriver`.
*   **Mitigation:** The API route `src/app/api/cards/route.ts` checks `!isCloudflareRuntime()` before doing local file operations. This prevents crashes but doesn't enable R2 storage.
*   **Required Action:** Register R2 driver in storage/index.ts when running on Cloudflare.

---

## ✅ Resolved Issues

### 1. Security: Unauthenticated File Uploads
*   **Status:** ✅ **FIXED**
*   **File:** `src/app/api/cards/route.ts`
*   **Fix:** Added `await getSession()` check - returns 401 if unauthorized. Sets `uploaderId` from session.

### 2. Security: Weak Password Hashing
*   **Status:** ✅ **FIXED**
*   **File:** `src/lib/auth/index.ts`
*   **Fix:** Now uses `bcryptjs` with work factor 12. Supports legacy SHA-256 hashes during migration.

### 3. Direct fs Calls in API Routes
*   **Status:** ✅ **FIXED**
*   **File:** `src/app/api/cards/route.ts`
*   **Fix:** Wrapped fs operations in `!isCloudflareRuntime()` checks. Thumbnail/asset generation disabled on Cloudflare.

---

## 📋 Next Steps (Priority Order)

1.  **[HIGH] Convert cards.ts to async:**
    - Use the `AsyncDb` wrapper from `src/lib/db/async-db.ts`
    - Convert all exported functions to be async
    - Update all API routes to await these functions

2.  **[MEDIUM] Register R2 Storage Driver:**
    - Import `R2StorageDriver` from `./r2`
    - Register it when `isCloudflareRuntime()` returns true
    - Update store() to use R2 in production

3.  **[LOW] Implement FTS alternative for D1:**
    - D1 doesn't support FTS5 virtual tables
    - Consider using Cloudflare Vectorize or external search service
