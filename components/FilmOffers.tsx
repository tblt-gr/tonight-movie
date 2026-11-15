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
 * or buy. A confirmed offer elsewhere stays visible even without an owned subscription.
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
  const primary = owned.length > 0 ? owned : other.length > 0 ? other : rental;
  const primaryTitle =
    owned.length > 0 ? t.offers.mine : other.length > 0 ? t.offers.streaming : t.offers.rentOrBuy;
  const moreStreaming = owned.length > 0 ? other : [];
  const moreRental = owned.length > 0 || other.length > 0 ? rental : [];
  return (
    <section aria-label={t.offers.label} className="offers">
      {primary.length > 0 ? (
        <div className="offers-owned">
          <h2 className="offers-title">{primaryTitle}</h2>
          <OfferList
            film={film}
            offers={primary}
            direct={direct}
            label={owned.length > 0 || other.length > 0 ? t.offers.watchOn : t.offers.rentOrBuyOn}
          />
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
        {(moreStreaming.length > 0 || moreRental.length > 0) && (
          <Accordion title={t.offers.also} count={moreStreaming.length + moreRental.length}>
            {moreStreaming.length > 0 && (
              <div className="offers-group">
                <h3 className="offers-title">{t.offers.alsoStreaming}</h3>
                <OfferList
                  film={film}
                  offers={moreStreaming}
                  direct={direct}
                  label={t.offers.watchOn}
                />
              </div>
            )}
            {moreRental.length > 0 && (
              <div className="offers-group">
                <h3 className="offers-title">{t.offers.rentOrBuy}</h3>
                <OfferList
                  film={film}
                  offers={moreRental}
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
