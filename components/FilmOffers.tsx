"use client";

import type { ReactNode } from "react";
import { Accordion } from "@/components/Accordion";
import { useI18n } from "@/components/I18nProvider";
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
  between,
}: {
  film: FilmForOffers;
  services: ReadonlySet<string>;
  /** Looks up direct links to the services: costs API credits, so only for a film on screen. */
  directLinks?: boolean;
  /** Rendered between the visitor's services and the other ways to watch. */
  between?: ReactNode;
}) {
  const { t } = useI18n();
  const direct = useWatchLinks(film.tmdbId, directLinks && hasOffers(film));
  const verified = film.availabilityStatus === "verified";
  const groups = offerGroups(film, services);
  const owned = verified ? groups.owned : [];
  const other = verified ? groups.other : [];
  const rental = verified ? groups.rental : [];
  return (
    <section aria-label={t.offers.label} className="offers">
      {owned.length > 0 ? (
        <div className="offers-owned">
          <h2 className="offers-title">{t.offers.mine}</h2>
          <OfferList film={film} offers={owned} direct={direct} label={t.offers.watchOn} />
        </div>
      ) : (
        <p className="tag-check">
          <span className="tag">{t.common.toCheck}</span>{" "}
          {film.offersUrl ? (
            <a href={film.offersUrl} target="_blank" rel="noopener noreferrer">
              {t.offers.checkOnTmdb} ({t.common.newTab})
            </a>
          ) : (
            t.offers.unconfirmed
          )}
        </p>
      )}
      <div className="offers-more">
        {between}
        {(other.length > 0 || rental.length > 0) && (
          <Accordion title={t.offers.also} count={other.length + rental.length}>
            {other.length > 0 && (
              <div className="offers-group">
                <h3 className="offers-title">{t.offers.alsoStreaming}</h3>
                <OfferList film={film} offers={other} direct={direct} label={t.offers.watchOn} />
              </div>
            )}
            {rental.length > 0 && (
              <div className="offers-group">
                <h3 className="offers-title">{t.offers.rentOrBuy}</h3>
                <OfferList
                  film={film}
                  offers={rental}
                  direct={direct}
                  label={t.offers.rentOrBuyOn}
                />
              </div>
            )}
          </Accordion>
        )}
      </div>
    </section>
  );
}
