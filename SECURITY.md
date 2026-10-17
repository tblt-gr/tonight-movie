# Security policy

## Reporting

Please do not open a public issue for a vulnerability. Use [GitHub private vulnerability reporting](https://github.com/tblt-gr/tonight-movie/security/advisories/new) when it is enabled. If that page is unavailable, open a public issue that only asks for a private channel, without any detail about the vulnerability; the maintainer ([@tblt-gr](https://github.com/tblt-gr)) will arrange one. Include the version or commit, impact, preconditions, reproduction steps, redacted configuration, affected routes or files, any mitigation and a safe proof of concept. Test only against your own local instance. Do not include third party credentials or personal data in a report.

The maintainer aims to acknowledge a report within 7 days and will coordinate a fix and disclosure with the reporter. There is no fix SLA for this personal project.

## Scope and properties

The project is in alpha: only the current `main` branch and the latest release are supported. Review concerns in the Next.js app, the TMDB route handlers, request validation and rate limiting, the in-browser import of Letterboxd exports (ZIP and CSV parsing), browser storage, and the dependency chain. Security sensitive boundaries include query parameters sent to `/api/*`, the `X-Forwarded-For` header, untrusted files dropped by the visitor, untrusted TMDB JSON and external poster or provider image URLs.

### Key handling

`TMDB_API_KEY` is the only secret. It is read on the server only, never prefixed with `NEXT_PUBLIC_`, never sent to the browser, logged or echoed in an error. Set it through the environment of your host; do not commit it, bake it into a Docker image or put it in client code. The route handlers validate every parameter and never forward the request to TMDB as is. If a key leaks, revoke it in your TMDB account settings and issue a new one.

### Personal data

The app has no user accounts and no database, and it never asks for Letterboxd credentials. A Letterboxd export is read in the visitor’s browser and is never uploaded: the server does not receive the file or the visitor’s watchlist, lists or watched films. Services, imported films and draw history live in the browser’s local storage only. The server sees the title, year and TMDB identifiers needed to look films up, plus the client IP for rate limiting (kept in process memory, not persisted). Do not log or store those requests in a way that links them to a person.

### Deployment

A public deployment should sit behind a proxy that overwrites `X-Forwarded-For`, and set `TRUSTED_PROXY_HOPS` accordingly; the rate limiter is per process and best effort. Archive parsing enforces size, ratio, entry and row limits to resist zip bombs, and a malformed file must fail with a clear error rather than crash the page.

Availability accuracy and third party outages are data quality and reliability concerns unless they create a security impact. Please still report them through ordinary issues.
