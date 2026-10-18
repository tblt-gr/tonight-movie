import { availabilityOn } from "@/lib/catalog";
import { WATCHLIST_ID } from "@/lib/import/apply";
import { isDrawable, matchFilm, normalizeTitle, type SearchFn } from "@/lib/match";
import {
  RECENT_DRAWS_LIMIT,
  type Settings,
  type StoredFilm,
  type StoredList,
} from "@/lib/storage/schema";
import type { DiscoverResponse, MovieDetails, MovieSummary } from "@/lib/types";
import { MAX_PAGE, MAX_PROVIDERS } from "@/lib/validation";

/** Source id for "all films on my services", drawn from TMDB instead of an imported list. */
export const SERVICES_SOURCE_ID = "services";

export const MAX_ATTEMPTS = 60;
/** Candidates judged at once: each one costs a few TMDB round trips. */
export const CONCURRENCY = 4;

export type NoneReason = "no-candidates" | "nothing-available" | "all-seen" | "all-too-long";

export type DrawResult =
  | { status: "found"; key: string; film: MovieDetails; attempts: number }
  | { status: "none"; reason: NoneReason; attempts: number };

export type DrawDeps = {
  search: SearchFn;
  getDetails(tmdbId: number): Promise<MovieDetails>;
  discover(providers: number[], maxRuntime: number | null, page: number): Promise<DiscoverResponse>;
  /** Uniform in [0, 1); injected so tests are deterministic. */
  random?: () => number;
  maxAttempts?: number;
  concurrency?: number;
};

export type DrawInput = {
  settings: Pick<Settings, "services" | "sources" | "maxDuration" | "excludeSeen" | "recentDraws">;
  films: StoredFilm[];
  lists: Pick<StoredList, "id">[];
};

/** Key of a film drawn from TMDB, which has no imported record. */
export const tmdbKey = (tmdbId: number) => `tmdb:${tmdbId}`;

/**
 * The chosen sources that still exist. Without any, the watchlist when one is
 * imported, otherwise all films on the selected services.
 */
export function effectiveSources(sources: string[], lists: Pick<StoredList, "id">[]): string[] {
  const ids = new Set(lists.map((list) => list.id));
  const chosen = [...new Set(sources)].filter((id) => id === SERVICES_SOURCE_ID || ids.has(id));
  if (chosen.length > 0) return chosen;
  return [ids.has(WATCHLIST_ID) ? WATCHLIST_ID : SERVICES_SOURCE_ID];
}

const titleYear = (title: string, year: number | null) => `${normalizeTitle(title)}|${year ?? ""}`;

export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

type Rejection = "unavailable" | "seen" | "tooLong";

type Candidate = {
  key: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  /** Never matched: needs a TMDB search before it can be judged. */
  unmatched: boolean;
  /** Stored match is low or none, so the film is never drawn. */
  weak: boolean;
};

function fromSummary(movie: MovieSummary): Candidate {
  return {
    key: tmdbKey(movie.tmdbId),
    title: movie.title,
    year: movie.year,
    tmdbId: movie.tmdbId,
    unmatched: false,
    weak: false,
  };
}

/**
 * Picks one film the visitor can watch tonight. Never throws: a TMDB error skips the
 * candidate and counts as an attempt, and giving up returns a typed "none found".
 * With a list source and the services source together, each attempt flips a coin.
 */
export async function drawFilm(input: DrawInput, deps: DrawDeps): Promise<DrawResult> {
  const { settings } = input;
  const random = deps.random ?? Math.random;
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const concurrency = deps.concurrency ?? CONCURRENCY;
  const services = new Set(settings.services);
  const sources = effectiveSources(settings.sources, input.lists);
  const listSources = new Set(sources.filter((id) => id !== SERVICES_SOURCE_ID));
  const providers = settings.services.map(Number).filter(Number.isFinite).slice(0, MAX_PROVIDERS);
  const useGlobal = sources.includes(SERVICES_SOURCE_ID) && providers.length > 0;
  const recent = new Set(settings.recentDraws.slice(0, RECENT_DRAWS_LIMIT));

  const seenIds = new Set<number>();
  const seenTitles = new Set<string>();
  if (settings.excludeSeen) {
    for (const film of input.films) {
      if (!film.seen) continue;
      if (film.tmdbId !== null) seenIds.add(film.tmdbId);
      seenTitles.add(titleYear(film.title, film.year));
    }
  }
  const isSeen = (candidate: Candidate, tmdbId: number) =>
    seenIds.has(tmdbId) || seenTitles.has(titleYear(candidate.title, candidate.year));

  const pool = shuffle(
    input.films.filter(
      (film) => !recent.has(film.key) && film.lists.some((id) => listSources.has(id)),
    ),
    random,
  ).map((film): Candidate => ({
    key: film.key,
    title: film.title,
    year: film.year,
    tmdbId: film.tmdbId,
    unmatched: film.confidence === null,
    weak: film.confidence !== null && !isDrawable(film),
  }));

  const counts: Record<Rejection, number> = { unavailable: 0, seen: 0, tooLong: 0 };
  let attempts = 0;
  let judged = 0;

  /** The film when it qualifies, a rejection reason, or `null` when it was merely repeated. */
  async function judge(candidate: Candidate): Promise<MovieDetails | Rejection | null> {
    if (candidate.weak) return "unavailable";
    let tmdbId = candidate.tmdbId;
    if (candidate.unmatched) {
      const match = await matchFilm(candidate, deps.search);
      if (match.confidence !== "high") return "unavailable";
      tmdbId = match.tmdbId;
    }
    if (tmdbId === null) return "unavailable";
    if (recent.has(tmdbKey(tmdbId))) return null;
    if (isSeen(candidate, tmdbId)) return "seen";
    const details = await deps.getDetails(tmdbId);
    if (availabilityOn(details, services) !== "available") return "unavailable";
    // A film of unknown runtime cannot be shown to fit, so a limit skips it.
    if (settings.maxDuration !== null) {
      if (details.runtime === null || details.runtime > settings.maxDuration) return "tooLong";
    }
    return details;
  }

  // Discover pages already fetched, minus the items already tried.
  const pages = new Map<number, Promise<MovieSummary[]>>();
  let totalPages = MAX_PAGE;

  async function nextGlobal(): Promise<Candidate | null> {
    const page = 1 + Math.floor(random() * totalPages);
    let loading = pages.get(page);
    if (!loading) {
      loading = deps.discover(providers, settings.maxDuration, page).then((response) => {
        // A page past the real end comes back empty; the next draw stays within the true range.
        totalPages = Math.max(1, Math.min(response.totalPages, MAX_PAGE));
        return [...response.results];
      });
      pages.set(page, loading);
      // A failed page is fetched again by a later attempt.
      loading.catch(() => pages.delete(page));
    }
    const items = await loading;
    const [movie] = items.splice(Math.floor(random() * items.length), 1);
    return movie && !recent.has(tmdbKey(movie.tmdbId)) ? fromSummary(movie) : null;
  }

  const result: { found: { key: string; film: MovieDetails } | null } = { found: null };

  async function worker() {
    while (!result.found && attempts < maxAttempts) {
      const global = useGlobal && (pool.length === 0 || random() < 0.5);
      if (!global && pool.length === 0) return;
      attempts += 1;
      try {
        const candidate = global ? await nextGlobal() : (pool.pop() ?? null);
        if (!candidate) continue;
        judged += 1;
        const outcome = await judge(candidate);
        if (outcome === null) continue;
        if (typeof outcome === "string") counts[outcome] += 1;
        else result.found ??= { key: candidate.key, film: outcome };
      } catch {
        // A TMDB failure only costs this attempt.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (result.found) return { status: "found", ...result.found, attempts };
  return { status: "none", reason: reasonFor(counts, judged), attempts };
}

function reasonFor(counts: Record<Rejection, number>, judged: number): NoneReason {
  if (judged === 0) return "no-candidates";
  const top = Math.max(counts.unavailable, counts.seen, counts.tooLong);
  if (counts.unavailable === top) return "nothing-available";
  return counts.seen === top ? "all-seen" : "all-too-long";
}
