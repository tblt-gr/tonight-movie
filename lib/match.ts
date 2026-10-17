import type { MovieSummary } from "@/lib/types";

export type MatchConfidence = "high" | "low" | "none";

export type Match = { tmdbId: number | null; confidence: MatchConfidence };

export type FilmToMatch = { title: string; year: number | null };

/** The only side effect of matching; the caller decides how to reach TMDB. */
export type SearchFn = (title: string, year: number | null) => Promise<MovieSummary[]>;

const ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une", "des"]);

/** Case, accents, punctuation and a leading article do not tell two titles apart. */
export function normalizeTitle(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/&/g, " and ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

const names = (movie: MovieSummary) => [movie.title, movie.originalTitle ?? ""].map(normalizeTitle);
const titleMatches = (movie: MovieSummary, wanted: string) => names(movie).includes(wanted);

/**
 * Matches one imported film to a TMDB film.
 * - high: normalized title and year are equal;
 * - low: year off by one, only an alternative title matched, or a film without year with
 *   several candidates;
 * - none: TMDB found nothing.
 * Search errors propagate: a failure is not a verdict.
 */
export async function matchFilm(film: FilmToMatch, search: SearchFn): Promise<Match> {
  const wanted = normalizeTitle(film.title);
  const low = (movie: MovieSummary | undefined): Match =>
    movie ? { tmdbId: movie.tmdbId, confidence: "low" } : { tmdbId: null, confidence: "none" };

  if (film.year === null) {
    const results = await search(film.title, null);
    const named = results.filter((movie) => titleMatches(movie, wanted));
    if (named.length === 1) return { tmdbId: named[0].tmdbId, confidence: "high" };
    return low(named[0] ?? results[0]);
  }

  const year = film.year;
  const sameYear = (await search(film.title, year)).filter((movie) => movie.year === year);
  const exact = sameYear.find((movie) => titleMatches(movie, wanted));
  if (exact) return { tmdbId: exact.tmdbId, confidence: "high" };

  // The year filter hides a neighbouring year, so look again without it.
  const around = (await search(film.title, null)).find(
    (movie) =>
      movie.year !== null && Math.abs(movie.year - year) === 1 && titleMatches(movie, wanted),
  );
  return low(around ?? sameYear[0]);
}

/** Stored as the `confidence` number of a film record; `null` there means unresolved. */
export const CONFIDENCE_VALUES: Record<MatchConfidence, number> = { high: 1, low: 0.5, none: 0 };

/** Only a high match is drawable; low and none are flagged À vérifier. */
export const isDrawable = (film: { tmdbId: number | null; confidence: number | null }) =>
  film.tmdbId !== null && film.confidence === CONFIDENCE_VALUES.high;

export const needsCheck = (film: { confidence: number | null }) =>
  film.confidence !== null && film.confidence < CONFIDENCE_VALUES.high;
