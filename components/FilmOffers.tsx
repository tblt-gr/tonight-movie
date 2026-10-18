"use client";

import { ProviderLink } from "@/components/ProviderLink";
import { hasOffers, offerGroups, offerHref } from "@/lib/draw-state";
import { useWatchLinks } from "@/lib/use-watch-links";
import type { MovieDetails, Offer } from "@/lib/types";

type FilmForOffers = Pick<
  MovieDetails,
  "tmdbId" | "title" | "offers" | "availabilityStatus" | "offersUrl"
>;

function OfferList({
  film,
  offers,
  direct,
  label,
}: {
  film: FilmForOffers;
  offers: Offer[];
  direct: Readonly<Record<string, string>>;
  label: (name: string) => string;
}) {
  return (
    <ul className="result-offers">
      {offers.map((offer) => {
        const href = offerHref(film, offer, direct);
        return (
          <li key={offer.id}>
            {href ? (
              <ProviderLink
                id={offer.id}
                name={offer.name}
                icon={offer.icon}
                href={href}
                label={label(offer.name)}
              />
            ) : (
              <span>{offer.name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Where to watch a film: on the visitor's services first, then on other services, then to rent
 * or buy. Without a confirmed offer on the visitor's services it says À vérifier.
 */
export function FilmOffers({
  film,
  services,
  directLinks = false,
}: {
  film: FilmForOffers;
  services: ReadonlySet<string>;
  /** Looks up direct links to the services: costs API credits, so only for a film on screen. */
  directLinks?: boolean;
}) {
  const direct = useWatchLinks(film.tmdbId, directLinks && hasOffers(film));
  const verified = film.availabilityStatus === "verified";
  const groups = offerGroups(film, services);
  const owned = verified ? groups.owned : [];
  const other = verified ? groups.other : [];
  const rental = verified ? groups.rental : [];
  return (
    <section aria-label="Où le regarder">
      {owned.length > 0 ? (
        <OfferList
          film={film}
          offers={owned}
          direct={direct}
          label={(name) => `Regarder sur ${name}`}
        />
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
      {other.length > 0 && (
        <>
          <p className="offers-label">Aussi en streaming sur</p>
          <OfferList
            film={film}
            offers={other}
            direct={direct}
            label={(name) => `Regarder sur ${name}`}
          />
        </>
      )}
      {rental.length > 0 && (
        <>
          <p className="offers-label">Louer ou acheter sur</p>
          <OfferList
            film={film}
            offers={rental}
            direct={direct}
            label={(name) => `Louer ou acheter sur ${name}`}
          />
        </>
      )}
    </section>
  );
}
