# CLAUDE.md — mtg-deckbuilder

Local MTG deckbuilder (Archidekt/Moxfield parity) with a Claude assistant. Design and decisions: `ARCHITECTURE.md`.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev (DB + migrations + web + worker) | `pnpm dev` |
| Embedded Postgres only | `pnpm db:pglite` (port 5433, data in `.data/pglite`) |
| Docker Postgres | `docker compose up -d` and set `DATABASE_URL=postgres://mtg:mtg@localhost:5432/mtg` |
| Migrations | `pnpm db:generate` (after schema change) · `pnpm db:migrate` |
| Ingest Scryfall bulk data | `pnpm ingest` |
| Ingest offline fixtures | `pnpm ingest:fixtures` |
| Regenerate fixtures (needs Scryfall access) | `pnpm fixtures:build` |
| Lint / format | `pnpm lint` · `pnpm lint:fix` |
| Typecheck | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| AI evals (needs `ANTHROPIC_API_KEY` + card data; spends credits) | `pnpm evals -- --yes` |
| E2E (app running, card data loaded) | `pnpm test:e2e` (set `PW_CHROMIUM_PATH` to use a pre-installed Chromium) |

Run `pnpm lint && pnpm typecheck && pnpm test` before every commit.

## Repo map

- `apps/web` — Next.js App Router. Pages in `src/app`, API route handlers in `src/app/api`, UI in `src/components`, client state in `src/stores`, server helpers in `src/server`.
- `apps/worker` — pg-boss jobs: `src/ingest.ts` (bulk data), `src/main.ts` (daily schedule), `src/cli.ts` (manual ingest).
- `packages/mtg` — pure domain logic. No I/O, no framework imports. Every module has tests in `test/`.
- `packages/db` — Drizzle schema (`src/schema.ts`), migrations (`drizzle/`), search compiler (`src/search.ts`), repositories.
- `packages/ai` — Claude provider, tools, prompts, evals.
- `fixtures/` — offline card dataset (generated from Scryfall).
- `scripts/` — dev orchestration and fixture builder.

## Conventions

- TypeScript strict, ESM, Biome for lint/format (double quotes, 2 spaces, width 110).
- Zod at every boundary: HTTP bodies, Scryfall payloads, AI tool inputs, settings.
- Domain rules live in `packages/mtg` and are unit-tested; the web app and DB layer stay thin.
- Any new search key must be implemented in both `packages/mtg/src/search/match.ts` and `packages/db/src/search.ts`, and added to the parity list in `packages/db/test/db.test.ts`.
- Schema change → `pnpm db:generate`, commit the generated SQL in `packages/db/drizzle`.
- Scryfall rules: descriptive `User-Agent` + `Accept` headers, < 10 req/s, prefer bulk data, credit Scryfall, never crop/alter images, load images from Scryfall's CDN.
- Never hand-write card data. Use Scryfall (or the generated fixtures). Test inputs in tests must be clearly synthetic.
- The Anthropic API key is server-side only and never logged.
- Conventional commits, small and logical.
- Record every non-obvious default under "Decisions" in `ARCHITECTURE.md`.

## Status (end of this session)

- Phases 0–4 are implemented; see README "Status" for what is verified and what is pending.
- Commits are authored as Adam Riffi (GitHub no-reply address) with Claude as co-author.
