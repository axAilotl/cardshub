# Repository Guidelines

## Project Structure & Module Organization
- Next.js app code lives in `src/app` (routes `admin/`, `explore/`, `card/[id]`, `upload/`); `layout.tsx` + `globals.css` set the shell.
- Shared UI in `src/components` (layout, cards); kebab-case files, PascalCase exports.
- Domain logic: `src/lib` (db, storage/R2, auth, card parser/architect, utils); shared types in `src/types`.
- Assets in `public/`; local uploads in `uploads/`; SQLite files and scripts at repo root.

## Build, Test, and Development Commands
- `npm run dev` – start the dev server.
- `npm run build` / `npm run start` – production build then serve.
- `npm run lint` – ESLint (Next + TypeScript flat config).
- `npm run test` (watch) / `npm run test:run` – Vitest with `@` → `src/` alias.
- `npm run db:init` or `npm run db:reset` – create or rebuild the local SQLite schema.
- `npm run admin:reset-pw` – reset the `admin` user password.
- Cloudflare: `npm run cf:build`, `cf:deploy`, `cf:dev`; provision with `cf:d1:create`, `cf:d1:migrate`, `cf:r2:create` (then update `wrangler.toml` IDs).

## Coding Style & Naming Conventions
- TypeScript-first; React function components. Use server components unless hooks/state require `"use client"`.
- 2-space indentation; imports ordered framework → third-party → local. Keep logic in `src/lib`, UI wiring in `src/app` or `src/components`.
- Filenames use kebab-case; exports use PascalCase for components/types and camelCase for helpers.
- ESLint warns on unused vars; explicit `any` only with a short justification. Run `npm run lint` before PRs.

## Testing Guidelines
- Vitest (Node). Place `*.test.ts(x)` near the code under test.
- Mock DB/storage; avoid writing to `cardshub.db` in unit tests. Focus on card parsing/generation and utility coverage.
- Add regression tests when changing routes or API handlers; prefer explicit assertions over snapshots.

## Database, Storage, and Configuration
- Local dev uses SQLite (`cardshub.db`); production uses Cloudflare D1 (`DB` binding). Run `db:reset` if schema drifts.
- FTS5 index comes from `scripts/init-db.ts`; rerun after bulk imports to refresh search data.
- R2 bucket stores uploads in production; keep local `uploads/` out of git.
- Env: `NEXT_PUBLIC_APP_URL` required; set OAuth secrets via Wrangler or dashboard. Do not commit `.env` files.

## Commit & Pull Request Guidelines
- Commit style: concise, imperative, present-tense (e.g., “Add card grid filters”).
- PRs should state what changed, why, and tests run; flag DB/Cloudflare steps (`cf:d1:migrate`, new env keys); include UI screenshots/clips and link issues when available.
