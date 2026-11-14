import { enrichFilms, type FactsFetcher } from "@/lib/enrich";
import { normalizeTitle, type FilmToMatch, type SearchFn } from "@/lib/match";
import type { Resolver } from "@/lib/resolve";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieSummary } from "@/lib/types";

export const CANDIDATE_LIMIT = 3;

const words = (title: string) => normalizeTitle(title).split(" ").filter(Boolean);

/** 3 for the same title, 2 when one title contains the other, else the share of words in common. */
function similarity(wanted: string, movie: MovieSummary): number {
  const target = words(wanted);
  let best = 0;
  for (const name of [movie.title, movie.originalTitle, movie.englishTitle]) {
    if (!name) continue;
    const candidate = words(name);
    const shared = target.filter((word) => candidate.includes(word)).length;
    if (shared === 0) continue;
    const [small, large] =
      target.length <= candidate.length ? [target, candidate] : [candidate, target];
    if (target.join(" ") === candidate.join(" ")) return 3;
    if (small.every((word) => large.includes(word))) best = Math.max(best, 2);
    else best = Math.max(best, shared / new Set([...target, ...candidate]).size);
  }
  return best;
}

/** The title before its subtitle: "Kill Bill: Vol. 1" also searches "Kill Bill". */
const mainTitle = (title: string) => title.split(/\s*[:–—]\s+|\s+-\s+/)[0].trim();

/**
 * The films closest to a title, for a visitor to choose from. The year does not filter the search:
 * a wrong year is what hides the right film from the automatic match. It only breaks ties.
 */
export async function findCandidates(
  film: FilmToMatch,
  search: SearchFn,
  limit = CANDIDATE_LIMIT,
): Promise<MovieSummary[]> {
  const queries = [...new Set([film.title.trim(), mainTitle(film.title)].filter(Boolean))];
  const answers = await Promise.all(queries.map((query) => search(query, null)));
  const unique = new Map<number, MovieSummary>();
  for (const movie of answers.flat())
    if (!unique.has(movie.tmdbId)) unique.set(movie.tmdbId, movie);
  const gap = (movie: MovieSummary) =>
    film.year === null || movie.year === null
      ? Number.MAX_SAFE_INTEGER
      : Math.abs(movie.year - film.year);
  return [...unique.values()]
    .map((movie, index) => ({ movie, index, score: similarity(film.title, movie) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || gap(a.movie) - gap(b.movie) || a.index - b.index)
    .slice(0, limit)
    .map(({ movie }) => movie);
}

/**
 * Records the film the visitor chose as a sure match. The stored facts belonged to the previous
 * match, so they are read again; if that fails the match stays and a later import fills them in.
 */
export async function confirmMatch(
  store: Resolver,
  film: StoredFilm,
  tmdbId: number,
  options: { fetchFacts?: FactsFetcher; signal?: AbortSignal } = {},
): Promise<void> {
  const { facts: _stale, ...rest } = film;
  void _stale;
  await store.upsertFilms([{ ...rest, tmdbId, confidence: 1, lists: [] }]);
  if (options.fetchFacts) {
    await enrichFilms([film.key], store, options.fetchFacts, { signal: options.signal });
  }
}
