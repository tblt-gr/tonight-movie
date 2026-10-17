# Security policy

## Reporting

Please do not open a public issue for a vulnerability. Use [GitHub private vulnerability reporting](https://github.com/tblt-gr/tonight-movie/security/advisories/new) when it is enabled. If that page is unavailable, open a public issue that only asks for a private channel, without any detail about the vulnerability; the maintainer ([@tblt-gr](https://github.com/tblt-gr)) will arrange one. Include the version or commit, impact, preconditions, reproduction steps, redacted configuration, affected routes or files, any mitigation and a safe proof of concept. Test only against your own local instance. Do not include third party credentials or personal data in a report.

The maintainer aims to acknowledge a report within 7 days and will coordinate a fix and disclosure with the reporter. There is no fix SLA for this personal project.

## Scope and properties

The project is in alpha: only the current `main` branch and the latest release are supported. Review concerns in the Next.js app, import routes, URL validation, HTML parsing, cache and job handling, browser storage, and dependency chain. Security sensitive boundaries include user supplied Letterboxd URLs, server side HTTP requests, untrusted source HTML and JSON, and external poster or provider URLs.

The app currently imports only public collections. It has no user accounts, credentials or access to private Letterboxd lists. Platform selections and recent list history remain in each browser; public collection snapshots are cached on the server. Do not put secrets in client code or logs. A public deployment should add rate limiting and a licensed data feed before broad usage.

Availability accuracy and third party endpoint outages are data quality and reliability concerns unless they create a security impact. Please still report them through ordinary issues.
