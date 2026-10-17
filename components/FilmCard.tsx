import { FilmPoster } from "@/components/FilmPoster";
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
  /** Names of the streaming services of the visitor that offer the film. */
  offerNames: string[];
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
  const meta = [
    film.year,
    film.runtime ? formatMinutes(film.runtime) : null,
    film.rating === null ? null : formatRating(film.rating),
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
          <FilmPoster title={film.title} poster={film.poster} />
        </span>
        <span className="film-card-body">
          <span className="film-card-title">{film.title}</span>
          {meta.length > 0 && <span className="film-card-meta">{meta.join(" · ")}</span>}
          {(film.uncertain || film.offerNames.length > 0) && (
            <span className="film-card-tags">
              {film.uncertain && <span className="tag">À vérifier</span>}
              {film.offerNames.map((name) => (
                <span key={name} className="tag tag-offer">
                  {name}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
