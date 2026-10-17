# Data sources and confidence

The server reads public Letterboxd collection pages for film order, titles and years. It reads film pages for duration, average rating, genres and the TMDB identifier when available. The importer then searches JustWatch’s French catalogue for a poster, provider icons, offer type and viewing link. It compares title and year before assigning offers to a film. The result is a dated snapshot, not a live guarantee.

`FLATRATE`, `FREE` and `ADS` are streaming offers. `RENT` and `BUY` appear only when the visitor enables them and never count as a subscription already owned. Prime Video and each Prime Video Channel are separate provider IDs.

An uncertain match is marked **À vérifier**. A verified title with no subscription or free offer is shown as unavailable in the current snapshot. This is limited by source coverage and collection date. Film details may be missing when upstream pages fail.

The importer currently uses public HTML and an undocumented JustWatch GraphQL endpoint. Both can change or return HTTP 403. This is suitable for a prototype, but a widely hosted service needs a licensed data source and its attribution terms. Relevant options include [JustWatch’s partner API](https://apis.justwatch.com/docs/api/) and [TMDB watch providers](https://developer.themoviedb.org/reference/movie-watch-providers). Access and coverage must be assessed before choosing one.

Public lists can also be inaccessible to the server even when they open in a browser. Private collections cannot be imported without explicit access. The app never asks for Letterboxd credentials. The source collection and film pages are linked from the UI.
