"use client";

import { FilmPoster } from "@/components/FilmPoster";
import { useI18n } from "@/components/I18nProvider";
import { formatMinutes, formatRating } from "@/lib/catalog";

/** What a result needs to be drawn, whatever source it came from. */
export type CardFilm = {
  id: string;
  /** Set when the TMDB match can be trusted: only then are details looked up. */
  tmdbId: number | null;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number | null;
  runtime: number | null;
  /** Streaming services of the visitor that offer the film. */
  offers: { name: string; icon: string | null }[];
  /** Weak match, failed lookup or unknown offer: shown as À vérifier. */
  uncertain: boolean;
};

export function FilmCard({
  film,
  onOpen,
}: {
  film: CardFilm;
  onOpen: (opener: HTMLElement) => void;
}) {
  const { t } = useI18n();
  const meta = [
    film.year,
    film.runtime ? formatMinutes(film.runtime, t) : null,
    film.rating === null ? null : formatRating(film.rating, t),
  ].filter(Boolean);
  return (
    <li className="film-card">
      <button
        type="button"
        className="film-card-open"
        aria-haspopup="dialog"
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className="film-card-poster">
          <FilmPoster title={film.title} poster={film.poster} alt={t.common.posterOf(film.title)} />
        </span>
        <span className="film-card-body">
          <span className="film-card-title" title={film.title}>
            {film.title}
          </span>
          {meta.length > 0 && <span className="film-card-meta">{meta.join(" · ")}</span>}
          {(film.uncertain || film.offers.length > 0) && (
            <span className="film-card-tags">
              {film.uncertain && <span className="tag">{t.common.toCheck}</span>}
              {film.offers.map(({ name, icon }) =>
                icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized logos.
                  <img key={name} src={icon} alt={name} title={name} width={28} height={28} />
                ) : (
                  <span key={name} className="tag tag-offer">
                    {name}
                  </span>
                ),
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
