"use client";

import Link from "next/link";
import { Accordion } from "@/components/Accordion";
import { FilmOffers } from "@/components/FilmOffers";
import { useI18n } from "@/components/I18nProvider";
import { formatMinutes, formatRating } from "@/lib/catalog";
import type { MovieDetails } from "@/lib/types";

export function DrawResult({
  film,
  services,
  headingRef,
}: {
  film: MovieDetails;
  services: ReadonlySet<string>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { t, href } = useI18n();
  return (
    <article className="result">
      <h1 tabIndex={-1} ref={headingRef} className="title-stack is-in">
        <span>{film.title}</span>
        {film.year && <span className="title-accent">{film.year}</span>}
      </h1>
      <div className="result-body">
        <FilmCredits film={film} />
        <dl className="result-figures">
          <div>
            <dt>{t.common.duration}</dt>
            <dd>{formatMinutes(film.runtime, t)}</dd>
          </div>
          <div>
            <dt>{t.common.tmdbRating}</dt>
            <dd>{formatRating(film.rating, t)}</dd>
          </div>
        </dl>
        <FilmOffers
          film={film}
          services={services}
          directLinks
          between={
            <Accordion key={film.tmdbId} title={t.draw.synopsis} defaultOpen>
              <p className="result-synopsis">{film.overview || t.draw.noSynopsis}</p>
            </Accordion>
          }
        />
        <p className="result-escape">
          {t.draw.escape} <Link href={href("films")}>{t.draw.escapeLink}</Link>
        </p>
      </div>
    </article>
  );
}

function FilmCredits({ film }: { film: MovieDetails }) {
  const { t } = useI18n();
  const rows = [
    [t.common.genres, film.genres.map((genre) => t.genres[genre] ?? genre)],
    [t.common.director, film.directors],
    [t.common.cast, film.cast],
  ].filter(([, names]) => names.length > 0);
  if (rows.length === 0) return null;
  return (
    <dl className="result-credits">
      {rows.map(([label, names]) => (
        <div key={label as string}>
          <dt>{label}</dt>
          <dd>{(names as string[]).join(", ")}</dd>
        </div>
      ))}
    </dl>
  );
}
