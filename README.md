# Tonight’s Movie

Choose a film you can actually watch tonight. Explore public Letterboxd collections, check streaming availability in France, and roll for a film when you cannot decide.

The app starts with [one curated list](https://letterboxd.com/maurice_deni/list/top-250-imdb-x-top-100-nwt/) containing 126 enriched films. Enter a Letterboxd username to discover accessible public lists, liked lists and a public watchlist, or paste any public list URL. No Tonight’s Movie account is required.

## Run locally

Requires Node.js 22 or newer (Node 20.9+ is supported by the dependencies).

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. If port 3000 is occupied, use `PORT=3047 npm run dev`.

Docker:

```bash
docker build -t tonight-movie .
docker run --rm -p 3000:3000 -v tonight-movie-data:/data tonight-movie
```

## What you can do

- Find collections from a public username, import a public list URL, return to recent lists, and share a collection with `?user=<username>&list=<encoded URL>`.
- Select your subscriptions in **Mes plateformes**. The initial selection is Prime Video, Max via Prime, M6+ and France TV via Prime. Other Prime channels are separate services.
- Browse posters or a compact list; filter by availability, service, title, duration and minimum Letterboxd rating; sort by rating, duration, platform, title, year or original list order.
- Roll for a random film from your selected services. Optional criteria include genre, duration, rating, service and scope. The last five draws are avoided when possible.
- Reveal rental and purchase offers explicitly. They are never treated as included in a Prime subscription.

Availability groups are **on your services**, **other French services**, and **no verified subscription or free offer**. Uncertain matches appear separately as **À vérifier**. A missing offer does not prove that a film is unavailable everywhere.

Settings, recent lists and draw history stay in the browser’s local storage. Imported snapshots are cached on the server for 24 hours. The server handles at most two imports at a time; it is designed as a single instance MVP.

## Data and deployment limits

The importer reads public Letterboxd pages for collections, film details, runtimes, ratings and genres. It searches JustWatch’s French catalogue for posters and streaming offers. These public endpoints may change or reject automated requests, including requests for otherwise public pages. Private Letterboxd collections are not accessible. Availability is dated in the UI and can change after collection.

The present JustWatch GraphQL access is a prototype dependency, not a contracted data feed. A public service needs a licensed source and a more robust identifier based matching system before broad deployment. See [data sources](docs/data-sources.md) and [architecture](docs/architecture.md).

## Development

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The project uses Next.js App Router, React, TypeScript and Radix Dialog. UI code is in `components/`, server import logic in `lib/`, and route handlers in `app/api/`. The starter collection is `dist/films.json`.

Project notes: [product](PRODUCT.md) · [design](DESIGN.md) · [documentation index](docs/README.md) · [extension plan](docs/extension-plan.md) · [backlog](docs/backlog.md).

Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).

Tonight’s Movie is independent of Letterboxd and JustWatch. Film metadata belongs to its respective sources.
