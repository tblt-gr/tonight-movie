"use client";

import { ProviderLink } from "@/components/ProviderLink";
import { useWatchLinks } from "@/lib/use-watch-links";
import { hasStreamingOffer, offerHref, offersToShow } from "@/lib/draw-state";
import type { MovieDetails } from "@/lib/types";

/** Where to watch a film on the visitor's services, or À vérifier when that is not confirmed. */
export function FilmOffers({
  film,
  services,
  directLinks = false,
}: {
  film: Pick<MovieDetails, "tmdbId" | "title" | "offers" | "availabilityStatus" | "offersUrl">;
  services: ReadonlySet<string>;
  /** Looks up direct links to the services: costs API credits, so only for an opened film sheet. */
  directLinks?: boolean;
}) {
  const direct = useWatchLinks(film.tmdbId, directLinks && hasStreamingOffer(film, services));
  const offers = offersToShow(film, services);
  const verified = film.availabilityStatus === "verified" && offers.length > 0;
  return (
    <section aria-label="Où le regarder">
      {verified ? (
        <ul className="result-offers">
          {offers.map((offer) => {
            const href = offerHref(film, offer, direct);
            return (
              <li key={offer.id}>
                {href ? (
                  <ProviderLink id={offer.id} name={offer.name} icon={offer.icon} href={href} />
                ) : (
                  <span>{offer.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tag-check">
          <span className="tag">À vérifier</span>{" "}
          {film.offersUrl ? (
            <a href={film.offersUrl} target="_blank" rel="noopener noreferrer">
              Voir la disponibilité sur TMDB (nouvel onglet)
            </a>
          ) : (
            "La disponibilité n’est pas confirmée."
          )}
        </p>
      )}
    </section>
  );
}
