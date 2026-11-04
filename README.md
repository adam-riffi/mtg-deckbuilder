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

## Development

See `CLAUDE.md` for commands and conventions and `ARCHITECTURE.md` for the design and decisions.
