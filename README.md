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
  <a href="#import-your-letterboxd-data">Import</a> &bull;
  <a href="#data-sources">Data sources</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

Pick your streaming services in France, and Tonight’s Movie draws one film you can watch right now: poster, duration, rating, synopsis and the services that offer it. The interface is in French.

You can optionally import your own Letterboxd export (watchlist, lists, liked and watched films) to draw among your films. The app never scrapes Letterboxd and never asks for Letterboxd credentials. There is no Tonight’s Movie account and no database: your services, your imported data and your draw history stay in your browser.

**Status: alpha.** See [limits](#limits).

## Run locally

Requires Node.js 22 or newer (Node 20.9+ is supported by the dependencies) and a free TMDB account for the API key.

1. Create a TMDB API read access token: sign in at <https://www.themoviedb.org/settings/api> and copy the **API Read Access Token** (the long v4 token, not the short v3 API key).
2. Install and configure:

   ```bash
   npm ci
   cp .env.example .env.local
   ```

   Then set `TMDB_API_KEY` in `.env.local` to your token.

3. Start the app:

   ```bash
   npm run dev
   ```

Open <http://localhost:3000>. If port 3000 is occupied, use `PORT=3047 npm run dev`. `GET /api/health` returns `200` when the key is configured and `503` with a clear detail when it is not.

### Docker

```bash
docker build -t tonight-movie .
docker run --rm -p 3000:3000 -e TMDB_API_KEY=<v4 token> -e TRUSTED_PROXY_HOPS=1 tonight-movie
```

The container keeps no data on disk, so it needs no volume. Pass the key at run time; never bake it into the image.

### Configuration

Copy `.env.example` to `.env.local` (local) or set the variables in your host (Docker, Vercel). They are server-only: never prefix them with `NEXT_PUBLIC_` and never commit a real value.

| Variable             | Required | Default | Purpose                                                                                                                                                                 |
| -------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMDB_API_KEY`       | yes      | none    | TMDB v4 read access token. Never sent to the browser, logged or echoed.                                                                                                 |
| `TRUSTED_PROXY_HOPS` | no       | `1`     | Number of trusted reverse proxies in front of the app, used to read the client IP from `X-Forwarded-For` for rate limiting. `0` ignores the header (one shared bucket). |
| `PORT`               | no       | `3000`  | Listening port.                                                                                                                                                         |

## What you can do

- Choose your streaming services among the French providers known to TMDB. At least one is required.
- Optionally import a Letterboxd export. An (i) guide in the app explains the steps; they are repeated [below](#import-your-letterboxd-data).
- Draw one film at random from a source (your watchlist, an imported list, your liked films, or all films on your services) with a maximum duration and an option to leave out films you have already seen. Draw again as often as you like; the last draws are avoided when possible.
- Browse and filter films manually from the link under the result.

Pages: `/` (presentation, skipped once services are chosen), `/reglages` (services and import), `/tirage` (the draw) and `/films` (browse and filter).

Streaming means `FLATRATE`, `FREE` and `ADS` offers. A missing or uncertain offer is shown as **À vérifier**: it does not prove that a film is unavailable.

## Import your Letterboxd data

Letterboxd does not connect to Tonight’s Movie. You download your own data, then drop it into the import block on `/reglages`:

1. Sign in to letterboxd.com from a computer.
2. Open your profile, then **Settings**.
3. Go to the **Data** tab.
4. Click **Export your data**.
5. Download the `.zip` archive Letterboxd provides.
6. Back in Tonight’s Movie, drop the archive into the import block without extracting it. A single `.csv` file such as `watchlist.csv` also works.

The file is read in your browser and is never uploaded to a server. Only the film titles, years and list memberships are kept, in your browser’s local storage; film details are then looked up on TMDB by title and year. Only a confident match can be drawn; a film whose match is uncertain is flagged **À vérifier** instead.

## Data sources

[TMDB](https://www.themoviedb.org/) is the single data source for film data and French watch providers. Watch-provider data comes from [JustWatch](https://www.justwatch.com/) through TMDB. Requests use `fr-FR` and `watch_region=FR`. No other service is called: there is no scraping and no Letterboxd request.

`FLATRATE`, `FREE` and `ADS` are streaming offers. `RENT` and `BUY` appear only when the visitor enables them and never count as a subscription already owned. Prime Video and each Prime Video Channel are separate provider IDs.

### Attribution

The `/a-propos` page, linked from the header, carries the credits and reads:

> Données des films fournies par TMDB et disponibilités par JustWatch. Tonight’s Movie n’est ni soutenu ni certifié par TMDB ou JustWatch.

In English: film data is provided by TMDB and availability by JustWatch. This product uses the TMDB API but is not endorsed or certified by TMDB or JustWatch. The page also carries the official TMDB logo (`public/tmdb-logo.svg`), as the [TMDB logo guidelines](https://www.themoviedb.org/about/logos-attribution) ask. Tonight’s Movie is also independent of Letterboxd. Keep this attribution on the `/a-propos` page in any deployment.

## Architecture

A single Next.js App Router application serves the React interface and a few stateless route handlers from one Node.js process. There is no database and nothing is stored on the server.

- The browser parses the Letterboxd export (`lib/import/`), keeps services, lists, films and draw history in local storage (`lib/storage/`), and runs the draw (`lib/draw.ts`).
- The route handlers are a thin, validated proxy to TMDB, so the key stays on the server:

| Route                                                     | Purpose                                         |
| --------------------------------------------------------- | ----------------------------------------------- |
| `GET /api/search?title=…&year=…`                          | Search by title, optional year                  |
| `GET /api/movie/{id}`                                     | Details plus French offers                      |
| `GET /api/providers`                                      | French watch provider list                      |
| `GET /api/discover?providers=8,119&maxRuntime=120&page=1` | Films streaming on any provider, page up to 500 |
| `GET /api/health`                                         | `200`, or `503` when `TMDB_API_KEY` is missing  |

Parameters are validated strictly (unknown ones get a 400) and there is no passthrough to TMDB. Errors are typed (`{ "error": { "code", "message" } }`). TMDB answers are cached by the Next fetch cache for 24 hours; that cache lives in `.next/cache` and holds public film data only. Each client IP is limited to 600 requests per minute by default, set by `RATE_LIMIT_PER_MINUTE` (429 beyond), read from `X-Forwarded-For` as set by your own proxies (`TRUSTED_PROXY_HOPS`); behind no proxy the header is client-controlled, so deploy behind one that overwrites it. Counters live in process memory, so several instances do not share them.

## Deployment

The app is stateless, so it runs anywhere Node.js 22 runs. `next.config.ts` builds a standalone server, which is what the [Dockerfile](Dockerfile) ships (non-root user, port 3000).

**Docker or any Node host:** set `TMDB_API_KEY`, put the app behind a reverse proxy that overwrites `X-Forwarded-For`, and set `TRUSTED_PROXY_HOPS` to the number of proxies. No volume is required.

**Vercel (optional):** import the repository, add `TMDB_API_KEY` as an environment variable, and deploy. There is no server storage to provision. Vercel sets `X-Forwarded-For` itself, so the default `TRUSTED_PROXY_HOPS=1` fits. Rate-limit counters are per serverless instance, so the limit is best effort there.

## Limits

- Availability comes from TMDB and JustWatch, can change at any time, and may be missing or wrong. A missing offer is **À vérifier**, never proof that a film is unavailable.
- Matching an imported film to TMDB uses title and year; ambiguous titles can be matched wrongly or not at all.
- Rate limiting is per process. Before broad public use, add a shared limiter and observability.
- Your data lives in one browser: clearing site data or switching browser starts from scratch, and you import again.

## Development

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

The project uses Next.js App Router, React, TypeScript and Radix Dialog. UI code is in `components/`, import, storage, matching and draw logic in `lib/`, and route handlers in `app/api/`. Tests are in `tests/` (Vitest).

Project notes: [product](PRODUCT.md) · [design](.impeccable/DESIGN.md) · [security](SECURITY.md).

## Contributing

Contributions are welcome; pull requests are squash-merged into `main` and must pass the `CI gate`. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).

Tonight’s Movie is independent of Letterboxd, TMDB and JustWatch. Film metadata belongs to its respective sources.
