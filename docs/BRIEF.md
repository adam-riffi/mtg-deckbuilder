# Product brief — AI-assisted MTG deckbuilder (local, full-featured)

This is the original brief the project is built against. Feature audits compare the implementation to this document.

## 1. Product
A locally hosted Magic: The Gathering deckbuilder at feature parity with Archidekt and Moxfield, plus a Claude-powered assistant that can search cards, analyse the deck and propose edits.
- Users: a single enthusiast on their own machine; multi-user capable.
- Non-goals (v1): public hosting, payments, social feed, online multiplayer, scraping sites without public APIs.

## 2. Stack
- TypeScript (strict) end to end, pnpm workspace:
  - apps/web: Next.js (App Router, Server Components, Route Handlers)
  - apps/worker: ingestion and scheduled jobs (pg-boss)
  - packages/db: Drizzle schema and migrations
  - packages/mtg: framework-free domain logic (deck model, legality, stats, search parser), fully unit-tested
  - packages/ai: Claude client, tools, prompts, evals
- UI: Tailwind, shadcn/ui (Radix), lucide, dnd-kit, TanStack Query/Table/Virtual, Zustand, cmdk (command palette), Recharts.
- Data: PostgreSQL (docker compose) with pg_trgm and full-text search.
- Auth: Better Auth (local email/password).
- AI: official Anthropic TypeScript SDK.
- Validation: Zod at every boundary.
- Tests: Vitest (unit), Playwright (e2e), PGlite for database tests.
- Tooling: Biome, lint-staged, GitHub Actions CI (lint, typecheck, test).
- Use current stable versions, pinned via lockfile.

## 3. Card data (Scryfall)
- The worker ingests Scryfall bulk data on first run and then daily: default cards (printings), oracle cards, rulings, and oracle tags if a bulk file exists. Stream-parse, upsert idempotently, record the last ingest.
- Scryfall rules: descriptive User-Agent and Accept headers on api.scryfall.com, under 10 req/s, bulk data preferred, credit Scryfall, never crop or alter card images, load images from Scryfall's CDN.
- Search: a Scryfall-syntax parser compiled to SQL (name, t:, o:, c:/id: with comparisons, mv/cmc, pow/tou, r:, set:, f:/legal:, is:, usd/eur, order:), plus fuzzy autocomplete via pg_trgm. Virtualised results; target <100 ms on the full dataset.
- Handle DFC/MDFC, split, adventure, meld, partner/background and colour identity correctly.
- Derive Commander Game Changers from Scryfall data. Store bracket rules as config, not code, because the system is still in beta and changes.
- Ship a fixture dataset (~500 cards covering edge cases) so development and tests work offline.

## 4. Deck editor (Archidekt + Moxfield parity)
- Layout: deck header (commander art, name, format, bracket, price, count, legality badge); collapsible AI chat panel on the left; deck area; card-search drawer.
- Views: Stacks, Grid, Text, Table. Group by custom category, type, mana value, colour, rarity or tag; sort within groups.
- Categories: custom, multiple per card, auto-categories (ramp, draw, removal, wipe, tutor, land…) suggested from oracle tags or AI, category templates.
- Zones: mainboard, sideboard, maybeboard, commander(s), companion.
- Editing: drag-and-drop, multi-select bulk actions, quantities, printing picker (set, art, finish), "cheapest printing" for the whole deck, undo/redo, keyboard shortcuts, command palette.
- Card detail: oracle text, rulings, legalities, printings, prices, related tokens.
- Import: plain text (set codes, foil markers, categories), Arena, MTGO, CSV, Moxfield/Archidekt formats, with a report of unresolved lines.
- Export: text, Arena, MTGO, CSV, deck image (PNG).
- Stats: mana curve by type, colour pips vs. sources, land-count guidance, category breakdown, average MV, price breakdown (EUR default, USD optional), hypergeometric calculator (e.g. "P(≥1 ramp by turn 3)").
- Legality: per-format validation (size, copies, colour identity, bans, commander eligibility) and a Commander bracket estimate with Game Changer count and explanation.
- History: automatic change log, named versions, diff any two versions or decks, restore.
- Primer: markdown with card-name hover previews.
- Playtester: library, hand, battlefield, graveyard, exile, command zone; draw, London mulligan, shuffle, scry, tap, counters, tokens, life and turn tracker; drag-and-drop and hotkeys.

## 5. Library, collection, prices
- Dashboard: folders, tags, search, filters (format, colour, bracket), clone deck, reusable card packages.
- Collection: CSV import (Moxfield, Archidekt, ManaBox), quantities per printing, owned/missing overlays in the editor, cost-to-complete.
- Prices: daily snapshots from bulk data, history charts per card and per deck.

## 6. AI assistant
Model and client
- Claude by default via the official SDK. Default model claude-sonnet-5-5; per-chat selector with claude-opus-5-5 for complex full builds and claude-haiku-5-5 for background tasks (auto-categorisation, thread titles). Model IDs in config, behind a provider interface.
- Streaming over SSE with cancel, prompt caching on system prompt and tool definitions, retries with backoff, token and cost display per message and per deck.
- API key server-side only (.env plus .env.example), never logged.

Context
- Each turn includes a compact deck summary (format, commander, colour identity, counts per category, curve, bracket, budget, legality issues), not full card objects. Details are fetched through tools.

Tools (Zod-validated, executed server-side)
- search_cards(query in Scryfall syntax, limit, order)
- get_cards(names | ids): oracle text, MV, types, legality, price
- get_deck, get_deck_stats, validate_deck (legality and bracket)
- propose_changes(add/remove/move/swap items, each with a reason): creates a pending change set and never mutates the deck directly
- check_collection(cards): owned quantities
- find_combos via the Commander Spellbook public API, optional and only if its terms allow

Change review
- Proposals appear as a diff card in chat and as highlighted ghost cards in the deck. Accept or reject per line or all at once. Applied changes enter deck history with "AI" as the source. Optional auto-apply toggle.

Behaviour (system prompt)
- Expert deckbuilding assistant. It never names a card it has not verified through tools.
- It respects format, colour identity, bracket, budget and, when asked, owned cards. It explains its reasoning briefly and asks one clarifying question when a brief is underspecified.
- Capabilities: full build from a brief, cuts and upgrades, mana base and curve analysis, synergy and combo explanations, budget or bracket tuning, format conversion, primer draft.

Evals
- A script with ~20 prompts asserting zero unverified card names, legal output, and budget/bracket compliance.

## 7. UX standards
Dark mode default, desktop-first but responsive, keyboard-first, accessible, optimistic updates, skeleton loading, toasts, meaningful empty states.

## 8. Data model (starting point; refine in ARCHITECTURE.md)
users, oracle_cards, printings, rulings, card_tags, price_snapshots, folders, decks, deck_cards (deck, printing, qty, zone, categories[], tags[], finish), deck_events, deck_versions, collections, collection_items, chat_threads, chat_messages (including tool calls), change_sets, change_set_items, settings.

## 9. Delivery plan
Each phase must meet its acceptance criteria.
- Phase 0, Foundations: workspace, docker compose, schema, auth, CI, fixtures, ARCHITECTURE.md, CLAUDE.md. Done when `pnpm dev` runs and CI is green.
- Phase 1, Core: ingest, syntax search, deck CRUD, editor (Stacks and Text, categories, zones, drag-and-drop), AI chat with tools and change review. Done when a legal Commander deck can be built end to end, both manually and through chat.
- Phase 2, Analysis: stats, legality, brackets, import/export, history/versions/diff, Grid and Table views, printing picker.
- Phase 3, Library: dashboard, folders, collection, prices and history, packages.
- Phase 4, Playtester and polish: playtester, primer, deck image export, combos, performance pass.
At the end of each phase, update README and CLAUDE.md and summarise what was built, what was deferred, and the next steps.
