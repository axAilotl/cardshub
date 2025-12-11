# Codebase Review: Character Federation Platform
**Date:** December 9, 2025
**Audience:** Project Management & Engineering Leads
**Focus:** Maintainability, Feature Velocity, User Experience, and Complexity Reduction.

---

## 1. Executive Summary

The application is built on a modern, cost-effective stack (Next.js + Cloudflare D1/R2). It is functionally competent but suffers from **"logic grouping" issues**. Specifically, business logic is heavily coupled directly into API Route handlers rather than separated into distinct services.

**Key Metric Impact:**
*   **Time-to-Market for new formats:** High. Adding a new card format requires modifying the monolithic `api/cards` handler.
*   **Bug Risk:** Moderate-High. The mix of raw SQL and complex validation logic in single files increases the chance of regression during refactors.
*   **Onboarding Cost:** Moderate. New developers must understand the entire upload pipeline to change one small part of it.

---

## 2. Critical Architectural Bottlenecks

### A. The "God Handler" Anti-Pattern (`src/app/api/cards/route.ts`)
The `POST` handler in this file is the single largest bottleneck in the application. It currently performs seven distinct responsibilities:
1.  Session authentication.
2.  Input validation (Zod).
3.  Format detection (Voxta vs. PNG vs. JSON).
4.  Parsing strategy selection (including fallback logic).
5.  Image processing/Thumbnail generation (Environment dependent: Node vs Cloudflare).
6.  Storage operations (R2/File system).
7.  Database writes (Transaction management).

**PM Impact:** Adding a feature like "Extract characters from a Tavern Chat history" becomes dangerous because you are modifying a 500+ line function that handles *all* uploads.
**Recommendation:** Refactor into a **Pipeline Pattern**. Create a `CardIngestionService` that accepts a file and runs it through strict stages: `Detector -> Parser -> AssetProcessor -> Storage -> Database`.

### B. In-Memory Rate Limiting (`src/lib/rate-limit.ts`)
The current implementation uses a JavaScript `Map` to store request timestamps.
**Technical Reality:** In a Serverless environment (Cloudflare Workers), memory is not shared between request isolates.
**User Impact:** Users may experience inconsistent blocking (being allowed to spam if they hit different workers) or random resets.
**PM Impact:** False sense of security regarding API abuse.
**Recommendation:** Replace immediately with **Cloudflare Rate Limiting API** or **KV-based storage**. This removes custom code maintenance and guarantees consistency.

### C. Hand-Rolled Authentication (`src/lib/auth`)
The project maintains its own session management, password hashing, and cookie logic using raw SQL.
**PM Impact:** High maintenance burden. Every security update or new auth requirement (e.g., 2FA, Passkeys) must be built from scratch.
**Recommendation:** Migrate to **Lucia Auth** (which supports D1 natively) or **Auth.js**. This offloads security critical maintenance to a library and speeds up adding social logins (Discord/Google).

---

## 3. Code Duplication & Complexity

### A. Format Parsing Logic
**Issue:** There is logic attempting to detect "Voxta" packages in multiple places (`api/cards/route.ts`). The fallback logic (`tryVoxtaParsing`) is nested within the upload handler.
**Refactoring Target:** The `@character-foundry/loader` dependency should be the *single source of truth*. If it fails to parse a ZIP, the application code should not attempt to "guess" it's a Voxta package manually. This logic belongs inside the library or a dedicated wrapper, not the API route.

### B. Environment Bifurcation (`isCloudflareRuntime`)
**Issue:** The code frequently checks `if (isCloudflareRuntime())` to decide whether to use `sharp` (Node) or `cf.image` (Worker) for thumbnails.
**Complexity:** This forces developers to maintain two parallel image processing pipelines. Bugs may appear in local dev (Node) that don't exist in Prod (Cloudflare) and vice versa.
**Recommendation:** Standardize on an interface (e.g., `IImageService`). Implement `NodeImageService` and `CloudflareImageService`. Inject the correct one at runtime. This cleans up the business logic code significantly.

---

## 4. Database Strategy & Scalability

### A. Raw SQL vs. ORM
**Issue:** The project uses Drizzle ORM but heavily relies on `db.prepare('RAW SQL').run()`.
**Risk:** This defeats the purpose of TypeScript type safety provided by Drizzle. Refactoring schema names (e.g., renaming `is_admin` to `role`) will not be caught by the compiler in raw SQL strings.
**Recommendation:** Fully commit to the Drizzle Query Builder. It supports the needed complexity and ensures that schema changes result in compile-time errors, preventing runtime crashes.

### B. "Federation" Readiness
**Observation:** The project is named "federation" but the database schema (`users`, `cards`) is designed for a single-tenant monolith.
**Missing Link:** There is no `actor_id` or `remote_url` column structure to support ActivityPub/Federated identity.
**PM Note:** If Federation is a Q1/Q2 goal, the database schema needs an immediate migration to separate "Local Users" from "Federated Actors". waiting will require a massive migration later.

---

## 5. User Experience (UX) Opportunities

### A. Optimistic UI & Client-Side Parsing
**Current State:** The user uploads a file -> Server processes it -> Server responds -> UI updates.
**Opportunity:** The `api/cards/route.ts` mentions "Client-side parsing". This is excellent.
**Improvement:** Move *more* validation to the browser. If a card is invalid, tell the user *before* they upload 50MB. Ensure the client-side parser matches the server-side validator exactly (share the Zod schemas via a shared package).

### B. Search Performance
**Current State:** `LIKE %...%` queries in SQL.
**Scalability Warning:** As the card count grows (>10k), this will become noticeably slow.
**Recommendation:** Plan for a dedicated search index (like Cloudflare D1 Full Text Search or an external service like Meilisearch) if growth targets are high.

---

## 6. Action Plan (Priority Order)

1.  **High (Stability):** Switch Rate Limiting to Cloudflare KV.
2.  **High (Velocity):** Extract `handleVoxtaCollectionUpload` and standard upload logic into a `CardService`. Remove business logic from the Next.js API route.
3.  **Medium (Maintenance):** Abstract Image Processing behind an Interface to remove `if(cloudflare)` spaghetti code.
4.  **Medium (Safety):** Replace raw SQL queries with Drizzle Query Builder syntax.

---

## 7. Deep Dive: Implementing Federation (ActivityPub)
To evolve from a centralized host to a federated node capable of syncing with external clients (like SillyTavern plugin) and other archival instances, the architecture must implement the **ActivityPub** standard.

### Core Concept: The "Push" Model
Current architecture relies on user actions modifying the database directly. Federation requires an **Event Sourcing** approach where every action (Create Card, Favorite, Edit) is an "Activity" that is broadcast to subscribers.

### Required Schema Changes
1.  **Identity Separation (Actors vs Users):**
    *   **New Table `actors`**: Represents any entity (Local User, Remote User, Bot). Stores public/private keys for HTTP signatures, Inbox/Outbox URLs.
    *   **Update `users`**: Link `users` to `actors`. A User authenticates to control an Actor.
2.  **The Activity Log:**
    *   **New Table `activities`**: An append-only log of actions (Type: `Create`, `Like`, `Update`, `Announce`).
    *   **Purpose**: Allows SillyTavern clients to ask "What changed since my last sync?" effectively.
3.  **Relationships:**
    *   **New Table `follows`**: Tracks which Actors subscribe to which other Actors (e.g., ST User subscribes to an Archive Bot).

### Use Case: SillyTavern Favorites Sync
**Goal:** A user "Favorites" a card on the web, and it appears in their local SillyTavern.
1.  **Web Action:** User clicks "Favorite".
2.  **Server Action:** 
    *   Inserts row into `favorites` table (Local State).
    *   Inserts `Like` activity into `activities` table (Federated State).
    *   **Broadcast:** Pushes the `Like` JSON to the user's SillyTavern instance Inbox (if configured).

### Use Case: Editor-to-Archive Pipeline
**Goal:** An external Desktop Editor pushes a new card to the Archive.
1.  **Editor Action:** Sends a `Create` activity (containing the Card JSON-LD) to the Archive's Shared Inbox.
2.  **Archive Action:** 
    *   Validates HTTP Signature (verifying the Editor's identity).
    *   Queues the job.
    *   **Async Worker:** Downloads assets, validates schema, and inserts into `cards` DB.

---

## 8. Deployment Strategy: Abstraction is Key
The codebase currently has good but partial abstractions (`src/lib/storage`, `src/lib/db/async-db.ts`). To support seamless multi-platform deployment (Cloudflare vs. VPS/Docker), we **must** double down on these abstractions.

### Why Abstraction?
Hardcoding `D1` or `R2` bindings makes the app "Cloudflare-only". Abstractions allow swapping infrastructure without rewriting business logic.

### A. Storage Abstraction (Repository Pattern)
*   **Current State:** `src/lib/storage/index.ts` is a good start, switching between R2 and FileSystem.
*   **Recommendation:** Formalize this into a `BlobStorageInterface`.
    *   **Implementations needed:**
        1.  `R2StorageAdapter` (Cloudflare)
        2.  `S3StorageAdapter` (AWS/MinIO for VPS users)
        3.  `FileSystemAdapter` (Local/Docker volumes)
    *   **Benefit:** A user can deploy on a $5 VPS using MinIO for storage just by changing an env var `STORAGE_PROVIDER=s3`.

### B. Database Abstraction (Drizzle is the Answer)
*   **Current State:** `src/lib/db/async-db.ts` manually wraps `better-sqlite3` and `D1` with a custom `AsyncDb` interface. This is brittle.
*   **Recommendation:** **Stop wrapping.** Use Drizzle's native adapters.
    *   Drizzle supports `drizzle-orm/d1` and `drizzle-orm/better-sqlite3` and `drizzle-orm/postgres-js`.
    *   **Strategy:** Create a `db.ts` factory that returns a Drizzle instance based on `process.env.DB_PROVIDER`.
    *   **Benefit:** Support PostgreSQL natively for heavy users, or SQLite for small VPS instances, without changing a single line of query code.

### C. Queue Abstraction (The Missing Piece)
*   **Current State:** No abstraction (only Cloudflare Queues exist in plan).
*   **Recommendation:** Create an `IQueue` interface (`enqueue`, `consume`).
    *   **Cloudflare:** Wrap `env.QUEUE.send()`.
    *   **VPS:** Wrap `BullMQ` (Redis).
    *   **Benefit:** Essential for the Federation Inbox. Without this, VPS users cannot process incoming Activities reliably.

---

## 9. The "Self-Hosted Kit" (Deliverable)
To truly fulfill the promise of "easy deployment" on any VPS, the project should ship a `docker-compose.yml` "starter kit".

**Components:**
1.  **App Container:** Running `next start` (Standalone mode).
2.  **DB Container:** Postgres (Recommendation over SQLite for multi-user/federated loads) or just a volume for SQLite.
3.  **Storage Container:** MinIO (S3 compatible) - Optional, can use local filesystem driver instead.
4.  **Queue/Cache Container:** Redis (Powering BullMQ and Rate Limiting).

**Configuration Strategy:**
Use a single `.env` file to control the abstraction switch:
```env
# Cloudflare Mode (Default)
# RUNTIME=cloudflare

# VPS Mode
RUNTIME=node
DB_PROVIDER=postgres
STORAGE_PROVIDER=s3
QUEUE_PROVIDER=redis
```
This single switch allows the same codebase to power a massive global hub (Cloudflare) or a private friend-group server (VPS).

---

## Addendum – Security & Federation Gaps (Compared to Latest Review, Dec 9, 2025)

These items were not captured or were understated in the original review and materially affect safety and deployability for community/self-hosted nodes.

### Critical
- **Unauthenticated R2 file reads:** `src/app/api/uploads/[...path]/route.ts` skips path validation and metadata checks in the Cloudflare/R2 branch. Any object key in the bucket can be fetched without verifying `uploads` metadata or visibility, leaking private/unlisted assets and enabling key-guessing attacks across instances.
- **Non-atomic writes on D1:** `getDatabase().transaction` is a no-op on Cloudflare (docstring says operations are NOT atomic). Logic assuming transactions (votes/favorites/session creation/upload writes) can interleave, leaving counters and head versions inconsistent under load.
- **Client-supplied upload metadata is trusted:** When `metadata` is sent in the upload form, the server bypasses `CardUploadMetadataSchema` and never recomputes token counts, visibility, or content hash. Clients can lie about tokens/hashes, submit oversized `cardData`, or tag/visibility combinations that would be rejected by server parsing.

### High
- **Rate limit bypass at scale:** Original review noted in-memory limits; additionally, Workers spin up many isolates and buckets are cleared on eviction. Abuse can rotate between isolates to avoid throttling entirely; consider KV/Redis-backed counters or Cloudflare native limits.
- **Visibility fragile when metadata missing:** If no `uploads` row exists (direct bucket writes, metadata insert failure), the uploads route serves the file publicly. Access control should fail-closed when metadata is absent.
- **Federation not implemented:** The codebase still lacks actor/instance identifiers, signatures, inbox/outbox model, or per-tenant namespaces. IDs are global and will collide across nodes; “federation” remains aspirational.

### Medium
- **Session safety/CSRF:** Sessions are bearer cookies with `SameSite=Lax` only, no CSRF tokens or origin checks. Multi-domain/community deployments risk cross-site form POST abuse; consider `SameSite=None; Secure` plus CSRF tokens or double-submit.
- **Security headers missing:** No CSP/HSTS/frame-ancestors/referrer-policy are set globally; operators must add middleware or Cloudflare rules to reduce XSS/clickjacking impact.
- **Content hash trust:** Client-provided `contentHash` is accepted, undermining dedupe/conflict detection and enabling tampered payloads to be labeled as previously seen.

### Recommendations (incremental)
1) Gate R2 reads on validated paths + existing `uploads` metadata; return 403 when metadata is missing or visibility requires tokens/session. Reuse `safeResolveUploadPath` logic for Cloudflare keys.
2) Move rate limits/sessions/counters to KV/Redis and replace D1 pseudo-transactions with idempotent updates or batch() calls; add optimistic locking for votes/favorites.
3) Always validate/recompute upload metadata server-side; drop or bound `cardData` length; recompute token counts and hashes; ignore client-provided visibility/tags that fail server policy.
4) Add CSRF protection and baseline security headers; document defaults for self-hosters.
5) Define federation data model (actors, signatures, remote IDs) before further feature work to avoid expensive migrations.
