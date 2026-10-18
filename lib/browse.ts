import { availabilityOn, collator, STREAM_TYPES } from "@/lib/catalog";
import { normalizeTitle } from "@/lib/match";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails, MovieSummary } from "@/lib/types";
import { FIRST_YEAR } from "@/lib/draw-state";
import { GENRES } from "@/lib/genres";
import { MAX_RUNTIME } from "@/lib/validation";

export const PAGE_SIZE = 24;

/** Films looked up per round trip when a page is not full yet. */
export const LOOKUP_BATCH = 12;

export type BrowseSort = "rank" | "rating" | "runtime" | "title" | "year";
export type BrowseView = "grid" | "list";
export type BrowseMode = "lists" | "services";

/** `all` ignores availability; any other chosen service is a provider id. */
export const SERVICE_ANY = "all";

const MAX_SERVICES = 20;

export type BrowseFilters = {
  query: string;
  minDuration: number | null;
  maxDuration: number | null;
  minRating: number | null;
  minYear: number | null;
  maxYear: number | null;
  /** Chosen services; empty means any of the visitor's own. */
  services: string[];
  /** Genre names; a film matches when it has any of them. */
  genres: string[];
  /** A saved list id or the services source; empty follows the draw settings. */
  source: string;
  hideSeen: boolean;
  sort: BrowseSort;
  view: BrowseView;
};

export const DEFAULT_FILTERS: BrowseFilters = {
  query: "",
  minDuration: null,
  maxDuration: null,
  minRating: null,
  minYear: null,
  maxYear: null,
  services: [],
  genres: [],
  source: "",
  hideSeen: false,
  sort: "rank",
  view: "grid",
};

const LIST_SORTS: BrowseSort[] = ["rank", "rating", "runtime", "title", "year"];
// TMDB's discover endpoint cannot order by runtime or by French title.
const SERVICES_SORTS: BrowseSort[] = ["rank", "rating", "year"];

export const sortsFor = (mode: BrowseMode): BrowseSort[] =>
  mode === "lists" ? LIST_SORTS : SERVICES_SORTS;

const MAX_QUERY = 100;

/** Invalid or unknown values fall back to the defaults so a stale link still opens. */
const duration = (raw: string | null) => {
  const value = raw !== null && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
  return value !== null && value >= 1 && value <= MAX_RUNTIME ? value : null;
};

const year = (raw: string | null) => {
  const value = raw !== null && /^\d{4}$/.test(raw) ? Number(raw) : null;
  return value !== null && value >= FIRST_YEAR && value <= new Date().getFullYear() ? value : null;
};

export function parseFilters(params: URLSearchParams): BrowseFilters {
  const rating = params.get("rating");
  const services = [
    ...new Set((params.get("service") ?? "").split(",").filter((id) => /^(all|\d{1,6})$/.test(id))),
  ].slice(0, MAX_SERVICES);
  const sort = params.get("sort");
  return {
    query: (params.get("q") ?? "").slice(0, MAX_QUERY),
    minDuration: duration(params.get("minduration")),
    maxDuration: duration(params.get("duration")),
    minRating: rating !== null && /^[1-9](\.5)?$/.test(rating) ? Number(rating) : null,
    minYear: year(params.get("from")),
    maxYear: year(params.get("until")),
    services,
    genres: (params.get("genres") ?? "")
      .split(",")
      .filter((name) => GENRES.some((genre) => genre.name === name)),
    source: /^[\w-]{1,64}$/.test(params.get("source") ?? "") ? params.get("source")! : "",
    hideSeen: params.get("seen") === "1",
    sort: LIST_SORTS.includes(sort as BrowseSort) ? (sort as BrowseSort) : DEFAULT_FILTERS.sort,
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

/** The query string (without `?`) holding only what differs from the defaults. */
export function serializeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.minDuration !== null) params.set("minduration", String(filters.minDuration));
  if (filters.maxDuration !== null) params.set("duration", String(filters.maxDuration));
  if (filters.minRating !== null) params.set("rating", String(filters.minRating));
  if (filters.minYear !== null) params.set("from", String(filters.minYear));
  if (filters.maxYear !== null) params.set("until", String(filters.maxYear));
  if (filters.services.length > 0) params.set("service", filters.services.join(","));
  if (filters.genres.length > 0) params.set("genres", filters.genres.join(","));
  if (filters.source) params.set("source", filters.source);
  if (filters.hideSeen) params.set("seen", "1");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.view !== DEFAULT_FILTERS.view) params.set("view", filters.view);
  return params.toString();
}

/** `failed` is a lookup that did not answer: the film stays visible and flagged. */
export type DetailState = MovieDetails | "failed";

export type Verdict = { verdict: "show" | "hide" | "pending"; uncertain: boolean };

const SHOW: Verdict = { verdict: "show", uncertain: false };
const FLAGGED: Verdict = { verdict: "show", uncertain: true };
const HIDE: Verdict = { verdict: "hide", uncertain: false };
const PENDING: Verdict = { verdict: "pending", uncertain: false };

const hasStream = (detail: MovieDetails, providerId: string) =>
  detail.offers.some((offer) => STREAM_TYPES.has(offer.type) && offer.id === providerId);

/** An unknown year passes here; it is judged again once the details are known. */
const inYears = (value: number | null, filters: BrowseFilters) =>
  value === null ||
  ((filters.minYear === null || value >= filters.minYear) &&
    (filters.maxYear === null || value <= filters.maxYear));

/**
 * Whether an imported film belongs in the results. A weak match, a failed lookup or an
 * unknown offer is shown flagged (`uncertain`) and is never counted as available.
 */
export function classifyListFilm(
  film: StoredFilm,
  detail: DetailState | undefined,
  filters: BrowseFilters,
  services: ReadonlySet<string>,
): Verdict {
  if (filters.hideSeen && film.seen) return HIDE;
  if (filters.query && !normalizeTitle(film.title).includes(normalizeTitle(filters.query))) {
    return HIDE;
  }
  if (!inYears(film.year, filters)) return HIDE;
  if (film.confidence === null) return PENDING;
  if (film.confidence < 1 || film.tmdbId === null) return FLAGGED;
  if (detail === undefined) return PENDING;
  if (detail === "failed") return FLAGGED;

  if (filters.minDuration !== null || filters.maxDuration !== null) {
    if (detail.runtime === null) return HIDE;
    if (filters.minDuration !== null && detail.runtime < filters.minDuration) return HIDE;
    if (filters.maxDuration !== null && detail.runtime > filters.maxDuration) return HIDE;
  }
  if (filters.minRating !== null && (detail.rating === null || detail.rating < filters.minRating)) {
    return HIDE;
  }
  if (film.year === null && !inYears(detail.year, filters)) return HIDE;
  if (filters.genres.length > 0 && !filters.genres.some((name) => detail.genres.includes(name))) {
    return HIDE;
  }

  if (filters.services.includes(SERVICE_ANY)) return SHOW;
  if (detail.availabilityStatus === "unknown") return FLAGGED;
  const onService =
    filters.services.length === 0
      ? availabilityOn(detail, services) === "available"
      : filters.services.some((id) => hasStream(detail, id));
  return onService ? SHOW : HIDE;
}

export type Shown = { film: StoredFilm; detail?: MovieDetails; uncertain: boolean };

export type ListPlan = {
  shown: Shown[];
  /** Films to look up next, in walking order. */
  pending: StoredFilm[];
  /** The page is full. */
  done: boolean;
  /** Every film was judged and the page is still not full. */
  exhausted: boolean;
};

const byYear = (a: StoredFilm, b: StoredFilm) => (b.year ?? -1) - (a.year ?? -1);

/** The order to walk the list in: stored data can order it up front, details cannot. */
function walkOrder(films: StoredFilm[], sort: BrowseSort): StoredFilm[] {
  if (sort === "title") return [...films].sort((a, b) => collator.compare(a.title, b.title));
  if (sort === "year") return [...films].sort(byYear);
  return films;
}

/**
 * Walks the list until `limit` films are shown. It stops showing at the first film it
 * cannot judge yet, so the page never reorders itself once a lookup answers, and reports
 * the next `batch` films to look up.
 */
export function planListPage(
  films: StoredFilm[],
  details: ReadonlyMap<number, DetailState>,
  filters: BrowseFilters,
  services: ReadonlySet<string>,
  limit: number,
  batch: number,
): ListPlan {
  const shown: Shown[] = [];
  const pending: StoredFilm[] = [];
  for (const film of walkOrder(films, filters.sort)) {
    if (pending.length === 0 && shown.length >= limit) {
      return { shown, pending, done: true, exhausted: false };
    }
    if (pending.length >= batch) break;
    const detail = film.tmdbId === null ? undefined : details.get(film.tmdbId);
    const { verdict, uncertain } = classifyListFilm(film, detail, filters, services);
    if (verdict === "pending") pending.push(film);
    else if (verdict === "show" && pending.length === 0) {
      shown.push({ film, detail: typeof detail === "object" ? detail : undefined, uncertain });
    }
  }
  const walkedAll = pending.length < batch;
  return {
    shown,
    pending,
    done: pending.length === 0,
    exhausted: pending.length === 0 && walkedAll && shown.length < limit,
  };
}

const nullsLast = (a: number | null | undefined, b: number | null | undefined, sign: 1 | -1) => {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return (a - b) * sign;
};

/** Orders what is shown. Rating and duration only know the films whose details are loaded. */
export function sortShown(items: Shown[], sort: BrowseSort): Shown[] {
  const sorted = [...items];
  switch (sort) {
    case "title":
      return sorted.sort((a, b) => collator.compare(a.film.title, b.film.title));
    case "year":
      return sorted.sort((a, b) => nullsLast(a.film.year, b.film.year, -1));
    case "rating":
      return sorted.sort((a, b) => nullsLast(a.detail?.rating, b.detail?.rating, -1));
    case "runtime":
      return sorted.sort((a, b) => nullsLast(a.detail?.runtime, b.detail?.runtime, 1));
    default:
      return sorted;
  }
}

const titleYear = (title: string, year: number | null) => `${normalizeTitle(title)}|${year ?? ""}`;

export type SeenIndex = { ids: Set<number>; titles: Set<string> };

export function seenIndex(films: StoredFilm[]): SeenIndex {
  const index: SeenIndex = { ids: new Set(), titles: new Set() };
  for (const film of films) {
    if (!film.seen) continue;
    if (film.tmdbId !== null) index.ids.add(film.tmdbId);
    index.titles.add(titleYear(film.title, film.year));
  }
  return index;
}

/** Same rule as the draw: a TMDB id or an equal normalized title and year means seen. */
export function filterGlobalResults(
  results: MovieSummary[],
  seen: SeenIndex,
  hideSeen: boolean,
): MovieSummary[] {
  if (!hideSeen) return results;
  return results.filter(
    (movie) => !seen.ids.has(movie.tmdbId) && !seen.titles.has(titleYear(movie.title, movie.year)),
  );
}
