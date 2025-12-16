# CardsHub — Testing Remediation Plan (Character Foundry Fixtures)

**Last updated:** 2025-12-15  
**Scope:** This repo (`cardshub` / `character-federation`) running in (1) Next.js from source, (2) local Docker, and (3) Cloudflare Workers via OpenNext.

## 0) Why this exists

We want tests to catch *real* regressions in import/export/validation and security handling without becoming flaky, slow, or “green by accident”.

This plan standardizes on:
- a single shared **golden fixtures** dataset (external to the repo),
- **explicit** skipping (no silent PASS),
- **tiered** test execution (`basic` always; `extended` on-demand; `large` manual/scheduled),
- **real parsers/schemas** (same code paths prod uses).

## 1) Fixtures contract (non-negotiable)

### 1.1 Fixture root
Tests must read the fixture root from:
- `CF_FIXTURES_DIR` (recommended)

Local default (this machine):
- `/home/vega/ai/character-foundry/fixtures`

### 1.2 Missing fixtures policy
- CI: **missing fixtures should fail**
- Local dev: allow skipping *only* with explicit opt-in:
  - `CF_ALLOW_MISSING_FIXTURES=1`

## 2) What’s already wired in this repo

### 2.1 Tier 1 (basic) fixture parsing test
File: `tests/fixtures/golden-fixtures.basic.test.ts`

Behavior:
- Reads `MANIFEST.md` from `CF_FIXTURES_DIR`
- Extracts the **Tier 1: Basic** table entries
- Parses each fixture with `@character-foundry/character-foundry/loader` using `{ extractAssets: true }`
- Asserts format/spec and that a baseline PNG yields an icon asset

Note:
- “v1 unwrapped JSON” is normalized by the loader to `spec = v2`; the test reflects that.

### 2.2 Token counting standardization
File: `src/lib/client/tokenizer.ts`

Behavior:
- Uses Character Foundry’s tokenizer registry (default `gpt-4` / `cl100k_base`)
- Preserves this app’s existing `TokenCounts` shape (DB schema compatibility)

## 3) Next steps (remediation roadmap)

### 3.1 L0 — Data-driven parsing/normalization tests (fast)
Goal: prove that **every `basic/` fixture** parses + schema-validates + normalizes consistently.

Add:
- A small “canonicalization” helper (deterministic sorting, timestamp normalization)
- Canonical expected outputs (preferably in the fixtures repo) so tests can do:
  - `parse -> normalize -> canonicalize -> deepEqual(expected)`

### 3.2 L1 — API integration (no network, hermetic DB/storage)
Goal: ensure upload/import endpoints persist correct metadata and never trust client fields.

Requirements:
- Temp SQLite DB path per test run
- Temp storage directory per test run
- Call Next route handlers directly with `Request` objects (no listening server) where possible

Target endpoints:
- `src/app/api/uploads/confirm/route.ts`
- `src/app/api/uploads/complete/route.ts`
- `src/app/api/cards/route.ts`

### 3.3 L2 — Web unit/component tests (import UX + token display)
Goal: prevent regressions in client parsing flows and UI rendering without full E2E.

Targets:
- `src/lib/client/card-parser.ts` (imports all `basic/` fixtures)
- upload UI token display + warnings rendering

### 3.4 L3 — E2E (Playwright, small but brutal)
Goal: catch “works locally, breaks deployed” and real-user flows.

Keep it small:
- Import 2–4 `basic/` fixtures (png v3, charx v3, voxta single/multi)
- Assert critical fields render, exports parse back, and no console errors

### 3.5 Tiering controls
Implement a single env switch for fixture tiers, e.g.:
- `CF_FIXTURE_TIER=basic|extended|large`

Default:
- `basic` for `npm run test:run`

## 4) How to run

Run unit tests with fixtures:
```bash
CF_FIXTURES_DIR=/home/vega/ai/character-foundry/fixtures npm run test:run
```

Skip fixtures locally (not for CI):
```bash
CF_ALLOW_MISSING_FIXTURES=1 npm run test:run
```

