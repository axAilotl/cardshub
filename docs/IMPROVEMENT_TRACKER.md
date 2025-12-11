# Improvement Tracker

**Last Updated:** December 9, 2025

---

## Quick Links
- [Improvement Plan](./IMPROVEMENT_PLAN.md) - Detailed phase breakdown
- [Upstream Issues](./UPSTREAM_ISSUES.md) - GitHub issues to file first
- [Testing Plan](./TESTING_PLAN.md) - Test cases and coverage requirements

---

## Pre-Work Checklist

### Upstream Issues (Filed Dec 9, 2025)
- [x] [#10](https://github.com/character-foundry/character-foundry/issues/10): D1SyncStateStore for federation package ✅ **CLOSED** (awaiting package publish)
- [x] [#11](https://github.com/character-foundry/character-foundry/issues/11): Token counting standardization ✅ **IMPLEMENTED in @character-foundry/tokenizers@0.1.0-security.0**
- [x] [#13](https://github.com/character-foundry/character-foundry/issues/13): Server-side metadata validation ✅ **CLOSED** (awaiting package publish)
- [x] [#9](https://github.com/character-foundry/character-foundry/issues/9): ImageService/media abstraction (commented with CF Workers support)
- [x] [#12](https://github.com/character-foundry/character-foundry/issues/12): HTTP signature validation (security) ✅ **IMPLEMENTED in federation@0.1.3-security.0**

### Package Updates (Completed Dec 9, 2025)
- [x] Upgraded to security-tagged packages (0.x.x-security.0)
  - `@character-foundry/core@0.0.2-security.0`
  - `@character-foundry/png@0.0.3-security.0`
  - `@character-foundry/charx@0.0.3-security.0`
  - `@character-foundry/voxta@0.1.3-security.0`
  - `@character-foundry/loader@0.1.5-security.0`
  - `@character-foundry/federation@0.1.3-security.0` (upgraded from 0.1.2)
  - `@character-foundry/tokenizers@0.1.0-security.0` (NEW - Issue #11)
- [x] Verified no breaking changes (218 tests pass)
- [x] TypeScript type checking passes
- [x] Created security package test suite (26 tests)

---

## Phase 1: Critical Security

| Task | Status | PR | Notes |
|------|--------|-----|-------|
| **1.1 R2 Access Control** | | | |
| └─ Add metadata check to R2 branch | [ ] | | |
| └─ Implement fail-closed behavior | [ ] | | |
| └─ Add R2 key validation | [ ] | | |
| └─ Write tests | [ ] | | |
| **1.2 Rate Limiting** | | | |
| └─ Create RateLimiter interface | [ ] | | |
| └─ Implement KVRateLimiter | [ ] | | |
| └─ Add KV binding to wrangler.toml | [ ] | | |
| └─ Write tests | [ ] | | |
| **1.3 Client Metadata Validation** | | | |
| └─ Create server-validation.ts | [ ] | | |
| └─ Always recompute tokens server-side | [ ] | | |
| └─ Always recompute hash server-side | [ ] | | |
| └─ Write tests | [ ] | | |
| **1.4 CSRF Protection** | | | |
| └─ Implement generateCsrfToken | [ ] | | |
| └─ Implement validateCsrfToken | [ ] | | |
| └─ Add withCsrf middleware | [ ] | | |
| └─ Write tests | [ ] | | |
| **1.5 Security Headers** | | | |
| └─ Add middleware.ts | [ ] | | |
| └─ Set CSP, HSTS, X-Frame-Options | [ ] | | |
| └─ Write tests | [ ] | | |

---

## Phase 2: Architecture

| Task | Status | PR | Notes |
|------|--------|-----|-------|
| **2.1 CardIngestionService** | | | |
| └─ Create pipeline architecture | [ ] | | |
| └─ Extract detector stage | [ ] | | |
| └─ Extract parser stage | [ ] | | |
| └─ Extract validator stage | [ ] | | |
| └─ Extract asset-processor stage | [ ] | | |
| └─ Extract storage stage | [ ] | | |
| └─ Extract database stage | [ ] | | |
| └─ Refactor API route | [ ] | | |
| └─ Write tests | [ ] | | |
| **2.2 Image Processing** | | | |
| └─ Create IImageService interface | [ ] | | |
| └─ Implement SharpImageService | [ ] | | |
| └─ Implement CloudflareImageService | [ ] | | |
| └─ Create factory function | [ ] | | |
| └─ Remove isCloudflareRuntime() from business logic | [ ] | | |
| └─ Write tests | [ ] | | |
| **2.3 Visibility Service** | | | |
| └─ Create VisibilityService | [ ] | | |
| └─ Refactor uploads route | [ ] | | |
| └─ Refactor download route | [ ] | | |
| └─ Refactor cards queries | [ ] | | |
| └─ Write tests | [ ] | | |
| **2.4 Drizzle Migration** | | | |
| └─ Create typed query helpers | [ ] | | |
| └─ Migrate cards.ts queries | [ ] | | |
| └─ Migrate collections.ts queries | [ ] | | |
| └─ Migrate uploads.ts queries | [ ] | | |
| └─ Remove raw SQL | [ ] | | |
| └─ Write comparison tests | [ ] | | |

---

## Phase 3: Federation Foundation

| Task | Status | PR | Notes |
|------|--------|-----|-------|
| **3.1 Use Federation Package** | | | |
| └─ Wait for D1SyncStateStore (Issue #1) | [ ] | | |
| └─ Create CardsHub PlatformAdapter | [ ] | | |
| └─ Add WebFinger route | [ ] | | |
| └─ Add NodeInfo route | [ ] | | |
| └─ Add Actor route | [ ] | | |
| └─ Add actors table to schema | [ ] | | |
| └─ Add activities table to schema | [ ] | | |
| └─ Write tests | [ ] | | |
| **3.2 Queue Abstraction** | | | |
| └─ Create IQueue interface | [ ] | | |
| └─ Implement CloudflareQueue | [ ] | | |
| └─ Implement BullMQQueue | [ ] | | |
| └─ Implement MemoryQueue (testing) | [ ] | | |
| └─ Write tests | [ ] | | |

---

## Metrics Tracking

### Code Quality
| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| Test coverage | ~30% | | 70% |
| cards/route.ts LOC | ~850 | | <100 |
| isCloudflareRuntime() calls | ~15 | | 0 |
| Raw SQL queries | ~95% | | <20% |

### Security
| Vulnerability | Severity | Fixed | PR |
|--------------|----------|-------|-----|
| Unauthenticated R2 access | Critical | [ ] | |
| In-memory rate limits | High | [ ] | |
| Client metadata trust | High | [ ] | |
| Non-atomic D1 transactions | High | [ ] | |
| Missing CSRF | Medium | [ ] | |
| Missing security headers | Medium | [ ] | |

---

## Dependencies

### Blocking Relationships
```
Phase 1.1 (R2 Access) ──┐
Phase 1.2 (Rate Limit) ─┼── Phase 2.1 (CardIngestionService)
Phase 1.3 (Metadata) ───┘

Issue #9 (media pkg) ─── Phase 2.2 (Image Processing)

Issue #10 (D1SyncStore) ─── Phase 3.1 (Federation)
Issue #12 (HTTP Sigs) ──┘
```

---

## Notes

### Session Notes
_Add notes from implementation sessions here_

- **Dec 9, 2025**: Initial planning complete. Created IMPROVEMENT_PLAN.md, UPSTREAM_ISSUES.md, TESTING_PLAN.md.
- **Dec 9, 2025**: Filed upstream issues #10, #11, #12, #13. Added comment to existing #9 for CF Workers support.
- **Dec 9, 2025**: Installed security-tagged packages (0.x.x-security.0). All 211 tests pass. Created `tests/packages/security-packages.test.ts` with 26 tests covering:
  - Error types (FoundryError, ParseError, ValidationError, PathTraversalError, SizeLimitError)
  - UUID utilities (generateUUID, isValidUUID)
  - Data URL utilities (toDataURL, fromDataURL, isDataURL)
  - Format detection (PNG, JSON, ZIP/CharX)
  - Card parsing (JSON CCv3)
  - Federation state stores (MemorySyncStateStore)
- **Dec 9, 2025**: API integration testing complete. Tested upload/download for all formats:
  - PNG (v2): Upload ✅, Download JSON ✅
  - CharX (RisuAI): Upload ✅ (25MB), Download JSON ✅, Download Original ✅
  - Voxta: Upload ✅, Download JSON ✅
- **Dec 9, 2025**: Upgraded federation to 0.1.3-security.0. Issue #12 (HTTP Signatures) now implemented! Added 4 new tests for:
  - `parseSignatureHeader()` - parse HTTP Signature headers
  - `buildSigningString()` - construct signing strings
  - `calculateDigest()` - SHA-256 digest calculation
  - Package export verification (verifyHttpSignature, signRequest)
- **Dec 9, 2025**: Installed @character-foundry/tokenizers@0.1.0-security.0. Issue #11 implemented! Added 3 tests for:
  - `countText()` - count tokens in text strings
  - `countCardTokens()` - count tokens per field with totals
  - Empty card handling
- **Dec 9, 2025**: Issues #10 and #13 confirmed closed. Awaiting loader@0.1.6-security.0 and federation@0.1.4-security.0 publish.

### Blockers
_Track blockers here_

- None currently

### Decisions Made
_Document key decisions_

1. **Rate limiting**: Using KV over D1 for rate limits (simpler, atomic)
2. **Image service**: Will be new package if upstream accepts (keep sharp optional)
3. **Federation**: Use existing @character-foundry/federation package (already installed but unused)
