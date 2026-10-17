# Architecture

Tonight’s Movie is a single Next.js App Router application. It serves the React interface and the import API from one Node.js process. No application account or database is needed for the first version.

## Request flow

1. The home page loads a bundled 126 film starter snapshot from `dist/films.json`.
2. `GET /api/profile?username=...` discovers public created and liked lists plus an accessible watchlist.
3. `POST /api/import` validates and canonicalizes a Letterboxd list or watchlist URL. A fresh cached snapshot returns immediately; otherwise the server starts a background import and returns a job ID.
4. `GET /api/jobs/{id}` reports progress, failure or the completed snapshot. The client polls while importing.
5. The importer reads the public collection and film pages, queries French JustWatch offers, compares title and year, and produces a dated snapshot. Ambiguous matches are marked unknown.
6. Browser local storage holds selected services, recent collection links and draw history. URL parameters `user` and `list` support sharing.

`DATA_DIR` defaults to `.cache` and holds JSON snapshots for 24 hours. Docker uses `/data` and supports a persistent volume. The job registry is in memory and limits active imports to two. This design requires one Node.js instance; restarts discard in progress jobs, while completed snapshots remain in the cache.

## API and security boundaries

The server accepts only HTTPS URLs on `letterboxd.com` with a recognized public list or watchlist path. A username has a restricted character set. External network requests are made by server code, and remote HTML is parsed as data. Client provided URLs are never fetched without canonicalization. API errors do not return upstream response bodies.

This MVP has no authentication, user specific server data or private list access. Public imports still cost network and compute time. Before broad deployment add persistent jobs, rate limits, cache coordination, observability, and an authorized catalogue feed. See [SECURITY.md](../SECURITY.md) and [data sources](data-sources.md).

## Future growth

- Separate films, collections, providers and country dated offers by stable identifiers to share matches across collections.
- Replace title and year matching with a verified identifier path.
- Move job state and cache to durable shared storage before running multiple instances.
- Keep an account optional unless private lists or cross device preference sync become product requirements.
- Build a complete provider catalogue before implementing a truly global draw outside Letterboxd collections.

The [extension plan](extension-plan.md) proposes reusing the availability model through a bulk API.
