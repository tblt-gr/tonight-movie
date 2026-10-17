<h1 align="center">Tonight’s Movie</h1>

<p align="center">Choose a film you can actually watch tonight.</p>

<p align="center">
  <a href="https://github.com/tblt-gr/tonight-movie/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tblt-gr/tonight-movie/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white">
  <a href="https://github.com/tblt-gr/tonight-movie/releases"><img alt="Version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-blue"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center">
  <a href="#run-locally">Run locally</a> &bull;
  <a href="#what-you-can-do">Features</a> &bull;
  <a href="#data-sources">Data sources</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

Explore public Letterboxd collections, check streaming availability in France, and roll for a film when you cannot decide.

The app starts with a bundled snapshot of 126 enriched films. Enter a Letterboxd username to discover accessible public lists, liked lists and a public watchlist, or paste any public list URL. No Tonight’s Movie account is required.

**Status: alpha.** Single-instance MVP built on unofficial public endpoints; see [limits](#data-and-deployment-limits).

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

The present JustWatch GraphQL access is a prototype dependency, not a contracted data feed. A public service needs a licensed source and a more robust identifier based matching system before broad deployment. See [Data sources](#data-sources) and [Architecture](#architecture).

## Data sources

The server reads public Letterboxd collection pages for film order, titles and years, and film pages for duration, average rating, genres and the TMDB identifier when available. It then searches JustWatch’s French catalogue for a poster, provider icons, offer type and viewing link, comparing title and year before assigning offers to a film. The result is a dated snapshot, not a live guarantee.

`FLATRATE`, `FREE` and `ADS` are streaming offers. `RENT` and `BUY` appear only when the visitor enables them and never count as a subscription already owned. Prime Video and each Prime Video Channel are separate provider IDs. An uncertain match is marked **À vérifier**.

Both sources are public HTML and an undocumented GraphQL endpoint that can change or return HTTP 403. A widely hosted service needs a licensed source such as [JustWatch’s partner API](https://apis.justwatch.com/docs/api/) or [TMDB watch providers](https://developer.themoviedb.org/reference/movie-watch-providers). The app never asks for Letterboxd credentials.

## Architecture

A single Next.js App Router application serves the React interface and the import API from one Node.js process, with no database.

1. The home page loads the bundled 126-film starter snapshot from `dist/films.json`.
2. `GET /api/profile?username=…` discovers public created and liked lists plus an accessible watchlist.
3. `POST /api/import` validates and canonicalizes a Letterboxd list or watchlist URL. A fresh cached snapshot returns immediately; otherwise a background import starts and a job ID is returned.
4. `GET /api/jobs/{id}` reports progress, failure or the completed snapshot; the client polls while importing.
5. Browser local storage holds selected services, recent collection links and draw history.

| Variable   | Scope  | Required | Default                      | Security impact                        |
| ---------- | ------ | -------- | ---------------------------- | -------------------------------------- |
| `DATA_DIR` | server | no       | `.cache` (`/data` in Docker) | Holds cached public snapshots for 24 h |
| `PORT`     | server | no       | `3000`                       | Listening port                         |

Only HTTPS `letterboxd.com` list or watchlist URLs are fetched, after canonicalization. The job registry is in memory and limited to two active imports, so one instance only. Before broad deployment add persistent jobs, rate limits, observability and an authorized catalogue feed.

## Development

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

The project uses Next.js App Router, React, TypeScript and Radix Dialog. UI code is in `components/`, server import logic in `lib/`, and route handlers in `app/api/`. The starter collection is `dist/films.json`.

Project notes: [product](PRODUCT.md) · [design](.impeccable/DESIGN.md).

## Contributing

Contributions are welcome; pull requests are squash-merged into `main` and must pass the `CI gate`. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).

Tonight’s Movie is independent of Letterboxd and JustWatch. Film metadata belongs to its respective sources.
