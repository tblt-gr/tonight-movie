# Tonight’s Movie

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, React, TypeScript, CSS and Radix Dialog. Stateless route handlers call TMDB. Personal data stays in the browser.

## Users

Film watchers in France, in the evening, on a sofa with a phone or laptop, tired of choosing. They know which streaming services they pay for and may keep a Letterboxd watchlist.

## Product Purpose

Answer one question: what do I watch tonight? Draw one film the visitor can actually watch now, from the services they own, and show everything needed to press play: poster, duration, TMDB rating, short synopsis and the services offering it. This is a decision tool, not a catalogue or a JustWatch clone.

## Operating Context

Desktop and mobile, mostly in the evening. No account. Services, imported Letterboxd data and draw settings stay in the browser. The visitor imports their own Letterboxd export (a zip or `watchlist.csv`); the app never scrapes Letterboxd and never asks for credentials.

## Capabilities and Constraints

- Presentation page for a first visit, then settings, then the draw. Routes: `/`, `/reglages`, `/tirage`, `/films`.
- Choose streaming services among all French providers known to TMDB. At least one is required.
- Optionally import a Letterboxd export: watchlist, lists, liked films and watched films. An (i) guide explains the export steps.
- Draw one film at random from a chosen source (watchlist, a list, liked films, or all films on the visitor’s services) with a maximum duration and an option to exclude films already seen. Redraw without limit.
- Browse and filter films manually from a link under the result.
- Streaming means `FLATRATE`, `FREE` and `ADS`. A missing or uncertain offer is **À vérifier**, never proof that a film is unavailable.
- Film data is from TMDB and offer data from JustWatch via TMDB. Attribution is required and the product is not endorsed by either.

## Brand Commitments

Own identity, in the language of French New Wave title cards translated to a dark screen: a near-black ground, warm off-white type, and one vivid green accent that owns every live state. Heavy wide capitals for titles, hard cuts instead of fades, no gradients, no rounded cards. The poster is the only image on the page. The product is independent of its data sources. The draw page is a full-screen dark room; the lights go down before the film appears.

## Evidence on Hand

- [TMDB](https://www.themoviedb.org/) for film data and French watch providers.
- Approved charter mockups under `.impeccable/mocks/charter/` (local, not committed).

## Product Principles

- Prioritize a watchable choice over browsing complexity.
- Show exactly what is included in the visitor’s services.
- Make uncertainty and data age visible.
- One decision at a time: each screen carries one message and one primary action.
