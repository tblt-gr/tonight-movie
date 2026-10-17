"use client";

import { useState } from "react";
import { categoryText, formatMinutes, isOwned, RENT_TYPES, relevantOffers } from "@/lib/catalog";
import type { Category } from "@/lib/catalog";
import type { Film } from "@/lib/types";

export function OfferChips({
  film,
  owned,
  includeRental,
  limit = 2,
}: {
  film: Film;
  owned: Set<string>;
  includeRental: boolean;
  limit?: number;
}) {
  const offers = relevantOffers(film, includeRental, owned);
  if (!offers.length)
    return (
      <span className="no-provider">
        {film.availabilityStatus === "unknown"
          ? "Disponibilité à vérifier"
          : "Aucune offre d’abonnement signalée"}
      </span>
    );
  return (
    <div className="provider-line">
      {offers.slice(0, limit).map((offer) => {
        const rental = RENT_TYPES.has(offer.type);
        const ownedOffer = !rental && isOwned(offer.id, owned);
        const suffix = rental ? ` · ${offer.type === "BUY" ? "achat" : "location"}` : "";
        return (
          <a
            className={`provider-chip ${ownedOffer ? "owned" : rental ? "rental" : ""}`}
            href={offer.url || film.justwatchUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={offer.name + suffix}
            key={`${offer.id}:${offer.type}`}
          >
            {offer.name + suffix}
          </a>
        );
      })}
      {offers.length > limit && film.justwatchUrl && (
        <a
          className="provider-more"
          href={film.justwatchUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          +{offers.length - limit} offres ↗
        </a>
      )}
    </div>
  );
}

export function FilmCard({
  film,
  category,
  owned,
  includeRental,
  view,
}: {
  film: Film;
  category: Category;
  owned: Set<string>;
  includeRental: boolean;
  view: "grid" | "list";
}) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  return (
    <article className="film-card">
      <a
        className="poster-link"
        href={film.letterboxdUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${film.title} (${film.year || "année inconnue"}), ${categoryText(category)}`}
      >
        {film.poster && failedPoster !== film.poster ? (
          // Posters already come in a small source-provided size; keep their original URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.poster}
            alt=""
            loading="lazy"
            onError={() => setFailedPoster(film.poster)}
          />
        ) : (
          <span className="poster-fallback">{film.title}</span>
        )}
        <span className="poster-shade" />
        <span className="rank-badge">#{film.rank}</span>
        <span className={`status-dot ${category}`} title={categoryText(category)} />
      </a>
      <a className="film-title" href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer">
        {film.title}
      </a>
      <div className="film-meta">
        <span>{film.year ?? "—"}</span>
        <span className="sep">·</span>
        <span>{formatMinutes(film.runtime)}</span>
        {film.rating != null && (
          <>
            <span className="sep">·</span>
            <span className="rating" title="Note moyenne Letterboxd">
              ★ {film.rating.toFixed(2).replace(".", ",")}
            </span>
          </>
        )}
      </div>
      <span className="list-subtitle">{categoryText(category)}</span>
      <OfferChips
        film={film}
        owned={owned}
        includeRental={includeRental}
        limit={view === "list" ? 3 : 2}
      />
    </article>
  );
}
