# Security policy

## Reporting

Please do not open a public issue for a vulnerability. Use [GitHub private vulnerability reporting](https://github.com/tblt-gr/tonight-movie/security/advisories/new) when available. If it is unavailable, contact [@tblt-gr](https://github.com/tblt-gr) privately. Include reproduction steps, affected routes or files, impact and any safe proof of concept. Do not include third party credentials or personal data in a report.

The maintainer will acknowledge a report and coordinate a fix and disclosure. There is no promised response or release SLA for this personal project.

## Scope and properties

The supported target is the current `main` branch. Review concerns in the Next.js app, import routes, URL validation, HTML parsing, cache and job handling, browser storage, and dependency chain. Security sensitive boundaries include user supplied Letterboxd URLs, server side HTTP requests, untrusted source HTML and JSON, and external poster or provider URLs.

The app currently imports only public collections. It has no user accounts, credentials or access to private Letterboxd lists. Platform selections and recent list history remain in each browser; public collection snapshots are cached on the server. Do not put secrets in client code or logs. A public deployment should add rate limiting and a licensed data feed before broad usage.

Availability accuracy and third party endpoint outages are data quality and reliability concerns unless they create a security impact. Please still report them through ordinary issues.
