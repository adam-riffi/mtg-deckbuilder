# MTG Deckbuilder

A locally hosted Magic: The Gathering deckbuilder with Archidekt/Moxfield-style editing and a Claude-powered assistant that searches cards, analyses the deck and proposes edits for you to review.

## Quick start

Requirements: Node 22+, pnpm 10. Docker is optional.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm dev
```

`pnpm dev` starts an embedded Postgres (PGlite) on port 5433 if nothing is listening there, applies migrations, then runs the web app on <http://localhost:3000> and the worker. On first run the worker ingests Scryfall bulk data (a few minutes); if Scryfall is unreachable it loads the offline fixtures.

To use Docker Postgres instead:

```bash
docker compose up -d
```

and set `DATABASE_URL=postgres://mtg:mtg@localhost:5432/mtg` in `.env`.

Set `ANTHROPIC_API_KEY` in `.env` to enable the assistant.

## Card data

- `pnpm ingest` — download and ingest Scryfall bulk data (oracle cards, all printings, rulings). The worker repeats this daily and records a price snapshot.
- `pnpm fixtures:build` — regenerate the offline fixture dataset (`fixtures/cards.json`) from Scryfall's API.
- `pnpm ingest:fixtures` — load the fixture dataset.

Card data and images are provided by [Scryfall](https://scryfall.com). Images load from Scryfall's CDN and are never cropped or altered. Magic: The Gathering is © Wizards of the Coast; this is unofficial Fan Content.

## Status

All four phases from the brief are implemented. Verified in this environment: lint, typecheck, 124 unit/database tests (PGlite), one Playwright e2e flow, and a production build.

| Phase | Built | Deferred / not yet verified |
|---|---|---|
| 0 Foundations | pnpm workspace, Drizzle schema + migration, embedded PGlite dev DB, Better Auth, CI, docs | Fixture dataset not generated: Scryfall was unreachable from the build container. Run `pnpm fixtures:build` once. |
| 1 Core | Bulk ingest, Scryfall-syntax search (SQL + in-memory parity tests), deck CRUD, editor (Stacks/Grid/Text/Table, categories, zones, drag and drop), AI chat with tools and change review | End-to-end chat not run here (no API key). Ingest not run against real bulk data. |
| 2 Analysis | Stats, legality, brackets (config-driven), import/export, history/versions/diff, printing picker, cheapest printings | Search latency target (<100 ms) not measured on the full dataset. |
| 3 Library | Dashboard (folders, filters, packages), collection with CSV import and overlays, price snapshots and charts | Price history needs several daily ingests to show trends. |
| 4 Playtester & polish | Playtester (London mulligan, scry, tokens, counters, life, turns), primer with hover previews, PNG export, optional Commander Spellbook lookup | Combo lookup is off by default until you confirm Commander Spellbook's terms. |

Next steps: run `pnpm ingest` with network access, `pnpm fixtures:build`, add `ANTHROPIC_API_KEY`, then `pnpm evals -- --yes`.

## Development

See `CLAUDE.md` for commands and conventions and `ARCHITECTURE.md` for the design and decisions.
