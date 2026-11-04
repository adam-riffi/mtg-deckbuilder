# Architecture

A locally hosted Magic: The Gathering deckbuilder with a Claude-powered assistant.
Single-user by default, multi-user capable (every deck, collection and chat belongs to a user).

## System overview

```
┌─────────────────────────── apps/web (Next.js App Router) ───────────────────────────┐
│ Server Components (pages)   Route Handlers (/api/*)   Better Auth (/api/auth/*)       │
│ Client islands: deck editor (Zustand + TanStack Query + dnd-kit), search drawer,     │
│ chat panel (SSE), stats (Recharts), playtester, command palette (cmdk)               │
└───────────────┬───────────────────────────────┬──────────────────────────────────────┘
                │ @mtg/db (Drizzle)              │ @mtg/ai (Anthropic SDK, tools)
                ▼                                ▼
        PostgreSQL (pg_trgm)  ◄────────  apps/worker (pg-boss jobs: ingest, prices)
        Docker, or embedded PGlite                │
                                                  ▼
                                    Scryfall bulk data (data.scryfall.io)
```

| Package | Responsibility | Depends on |
|---|---|---|
| `packages/mtg` | Framework-free domain logic: card model, Scryfall normaliser, deck model, formats, legality, commander/partner rules, brackets, stats, hypergeometric, auto-categories, search parser + in-memory matcher, import/export, diff. Fully unit-tested. | zod |
| `packages/db` | Drizzle schema + migrations, DB client (node-postgres or PGlite), Scryfall-syntax → SQL compiler, card queries, ingest upserts, deck/collection/chat repositories. | `@mtg/mtg` |
| `packages/ai` | Claude client behind a provider interface, model config, tool definitions (Zod), tool executors, system prompt, deck summary, cost accounting, evals. | `@mtg/mtg`, `@mtg/db` |
| `apps/worker` | Bulk-data ingestion (stream-parsed), daily schedule via pg-boss, price snapshots, fixture ingest. | `@mtg/db` |
| `apps/web` | UI and HTTP API. | all packages |

Internal packages are consumed as TypeScript source (no build step): Next.js transpiles them, the worker runs through `tsx`.

## Data model

Card data (rebuilt from Scryfall, never edited by users):

- `oracle_cards` — one row per oracle id. Normalised fields plus search helpers: `name_search` (lower-cased, accents stripped), `oracle_search` (reminder text removed, for `o:`), colour **bitmasks** (`colors_mask`, `identity_mask`, `produced_mask`; W=1 U=2 B=4 R=8 G=16), numeric `power_num`/`toughness_num`…, `game_changer`, `legalities` (jsonb), `tags` (oracle tags, mirrored from `card_tags`), aggregates from printings (`min_usd`, `min_eur`, `max_rarity`, `first_released`, `games`), `default_printing_id`, and a generated `search_vector` (tsvector). Trigram GIN indexes on name, oracle text and type line.
- `printings` — one row per Scryfall card id (set, collector number, rarity, finishes, prices, image URIs incl. per-face).
- `rulings`, `card_tags`, `price_snapshots` (printing × day), `ingest_runs`.

User data:

- Auth: `user`, `session`, `account`, `verification` (Better Auth core schema).
- `folders`, `decks` (format, primer, budget, target bracket, `is_package` for reusable packages, `auto_apply_ai`, category order), `deck_cards` (deck × oracle card × zone; printing, qty, categories[], tags[], finish).
- `deck_events` — append-only change log. Each event stores forward `ops` and `inverse` ops, so undo/redo and "restore" are generic. `source` is `user | ai | import | system`.
- `deck_versions` — named snapshots (full card list as jsonb). Diff any two versions or decks via `diffDecks`.
- `collections`, `collection_items` (printing × finish × condition × language → qty).
- `chat_threads`, `chat_messages` (Anthropic content blocks incl. tool calls/results, token and cost accounting).
- `change_sets`, `change_set_items` — AI proposals. The assistant can only create pending change sets; applying them is a user action (or auto-apply) that writes deck events with source `ai`.
- `settings` — scoped key/value (e.g. bracket config override).

## Search

1. `@mtg/mtg/search` lexes and parses Scryfall syntax into an AST, then interprets keys into a typed `Predicate` tree (`parseSearch`). Unknown keys produce errors and are ignored rather than failing the query.
2. `@mtg/db` compiles predicates to SQL over `oracle_cards o` (`compileWhere`, `compileOrder`). Printing-level filters (`set:`, `r:`, `a:`, `year:`, `is:foil`…) become `EXISTS` sub-queries on `printings`.
3. `matchQuery` evaluates the same predicates in memory (used for filtering inside the deck editor). A parity test runs every supported query through both and compares results.

Default exclusions match Scryfall: tokens/emblems/art series are hidden unless `is:token`, `t:token` or `include:extras`; digital-only cards are hidden unless `game:arena`/`game:mtgo`/`is:digital`.

## AI assistant

- Provider interface (`ChatProvider`) with an Anthropic implementation; model ids in `packages/ai/src/models.ts`.
- Each turn sends a compact deck summary (format, commanders, identity, counts per category, curve, bracket, budget, legality issues). Card details are fetched via tools.
- Tools (Zod-validated, server-side): `search_cards`, `get_cards`, `get_deck`, `get_deck_stats`, `validate_deck`, `propose_changes`, `check_collection`, `find_combos` (disabled unless enabled in settings).
- `propose_changes` creates a pending change set; the UI shows it as a diff card and ghost cards. Every card it names must resolve to a known oracle card, otherwise the tool returns an error to the model ("never name an unverified card").
- Streaming over SSE; cancel aborts the upstream request. Prompt caching on the system prompt and tool definitions.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | TypeScript 6.0 rather than 7.0 | TS 7 is the native (Go) compiler; Next.js and several tools still rely on the JS compiler API. Revisit when the ecosystem catches up. |
| D2 | node-postgres (`pg`) as the only runtime driver; PGlite exposed over the wire protocol via `pglite-socket` when Docker is unavailable | One code path for app, worker and drizzle-kit. PGlite is single-process, so the socket server lets web and worker share it. |
| D3 | Tests use in-process PGlite (`drizzle-orm/pglite`) | Fast, hermetic, no services needed in CI. |
| D4 | Colour sets stored as 5-bit masks | Subset/superset checks for `c:`/`id:` become integer ops, indexable and identical in JS and SQL. |
| D5 | One row per oracle card in search results (`unique:cards`), image from `default_printing_id` | Matches Scryfall's default; printing picker handles the rest. |
| D6 | Printing filters use `EXISTS` per predicate | Simple and fast; differs from Scryfall only when two printing filters must hold for the same printing in different OR branches. |
| D7 | Price filters/sorts use the cheapest non-digital printing (`min_usd`/`min_eur`) | Fast, indexable, and what a budget builder wants. |
| D8 | Bracket rules in `packages/mtg/src/config/brackets.json`, overridable through the `brackets` setting | The bracket system is in beta and changes; no code change needed. Estimate never exceeds bracket 4: cEDH depends on intent. |
| D9 | Game Changers come from Scryfall's `game_changer` flag | "Derive from Scryfall data" per the brief; no hand-maintained list. |
| D10 | Deck history as event sourcing with inverse ops | Undo/redo, AI attribution and restore share one mechanism. |
| D11 | Companion condition not validated | Each companion has a bespoke deckbuilding condition; we validate presence/identity and warn only. |
| D12 | Land-count guidance uses a published rule of thumb (31 + 1.5×avg MV for Commander, 16 + 3×avg MV for 60-card) | Transparent and explainable; shown with its formula. |
| D13 | Non-English printings and art series are skipped at ingest | English oracle data is what deckbuilding needs; keeps the dataset small. |
| D14 | EUR is the default currency; USD optional per user setting | Per brief. |
| D15 | Commander Spellbook integration is off by default | Only enabled once its terms are confirmed by the user; the tool reports "not enabled" otherwise. |
| D16 | Fixture dataset is generated from Scryfall, never hand-written | The build environment could not reach Scryfall; `pnpm fixtures:build` produces `fixtures/cards.json` from a curated list of edge-case card names. Tests that need cards use clearly-labelled synthetic test inputs. |
| D17 | Card images use plain `<img>` with Scryfall CDN URLs (`images.unoptimized`) | Next's image optimiser re-encodes images; Scryfall asks that images are not altered. Mana symbols load from `svgs.scryfall.io` with a text fallback offline. |
| D18 | TanStack Table pinned to v8 | v9 changed its API substantially; v8 is stable and well documented. |
| D19 | Default chat model `claude-sonnet-5-5` at effort `medium`; `claude-opus-5-5` (effort `high`) for full builds; `claude-haiku-5-5` for thread titles | Per brief; Sonnet 5.5 guidance recommends `medium` for multi-step tool use. Model ids and prices live in `packages/ai/src/models.ts`. |
| D20 | Server-side refusal fallback (`fallbacks: "default"`) on Sonnet/Opus | Recommended default for these models on the Claude API; a declined request is retried on a fallback model inside the same call. Haiku has no server-side fallback. |
| D21 | Deck summary is sent in the user turn, not the system prompt | Keeps system prompt and tool definitions byte-stable for prompt caching; history is append-only so thinking blocks stay valid. |
| D22 | Unverified-name check: the model writes card names as `[[Name]]`; names not seen in tool results are flagged in the UI and fail evals | Deterministic check of "never names a card it has not verified". `propose_changes` additionally rejects any name not in the database. |
| D23 | Auto-apply runs client-side after a proposal arrives | Keeps the server rule "AI never mutates the deck" absolute; auto-applied changes are still normal undoable AI events. |
| D24 | Worker falls back to an in-process daily timer if pg-boss cannot start | pg-boss needs features the embedded PGlite server may not provide on every platform. |
| D25 | Bracket estimate counts tutors with a text heuristic and treats two-card combos as "not checked" unless Commander Spellbook is enabled | Combo data needs an external service the user must opt into. |
| D26 | Collection overlays use the cheapest printing for cost-to-complete | Matches the "budget" view; per-printing ownership is still stored. |
