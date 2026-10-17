# Tonight’s Movie

<!-- impeccable:product-schema 1 -->

## Platform

Responsive web application.

## Stack

Next.js App Router, React, TypeScript, CSS and Radix Dialog. Node.js imports public collections and caches dated snapshots.

## Users

Film watchers in France who want to choose from a public Letterboxd collection based on their subscriptions, time and taste.

## Product Purpose

Make a film collection watchable: show each title, poster, duration, Letterboxd rating and French streaming offers, then help the visitor choose a film quickly.

## Operating Context

Desktop and mobile. No app account. Initial owned services: Prime Video, Max via Prime, M6+ and France TV via Prime. Preferences and recent lists stay in the browser.

## Capabilities and Constraints

- Enter a Letterboxd username to find accessible public created lists, liked lists and watchlist, or paste any public list URL.
- Filter by availability group, provider, duration, rating and title; sort by list order, rating, duration, provider, title or year; switch between poster grid and list.
- Draw a random film from owned services, optionally constrained by genre, duration, rating, service and scope.
- Distinguish subscription and free offers from rental and purchase. Mark uncertain matches separately.
- Share the current collection in the URL and revisit recent lists.
- Public pages may be blocked; private lists are unsupported. Source offers are dated and may change. A global draw needs a complete licensed catalogue.

## Brand Commitments

Own identity: midnight blue, cream and fresh green. A calm editorial heading and clear controls frame the posters. The product is independent of its data sources.

## Evidence on Hand

- [JustWatch France](https://www.justwatch.com/fr)
- Dated starter snapshot in `dist/films.json`.

## Product Principles

- Prioritize a watchable choice over browsing complexity.
- Show exactly what is included in a selected subscription.
- Make uncertainty and data age visible.
