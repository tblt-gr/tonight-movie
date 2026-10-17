import { availabilityOn, collator, STREAM_TYPES } from "@/lib/catalog";
import { normalizeTitle } from "@/lib/match";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails, MovieSummary } from "@/lib/types";
import { MAX_RUNTIME } from "@/lib/validation";

export const PAGE_SIZE = 24;

/** Films looked up per round trip when a page is not full yet. */
export const LOOKUP_BATCH = 12;

export type BrowseSort = "rank" | "rating" | "runtime" | "title" | "year";
export type BrowseView = "grid" | "list";
export type BrowseMode = "lists" | "services";

/** `mine` is the visitor's services, `all` ignores availability, anything else is a provider id. */
export const SERVICE_MINE = "mine";
export const SERVICE_ANY = "all";

export type BrowseFilters = {
  query: string;
  maxDuration: number | null;
  service: string;
  genre: string | null;
  hideSeen: boolean;
  sort: BrowseSort;
  view: BrowseView;
};

export const DEFAULT_FILTERS: BrowseFilters = {
  query: "",
  maxDuration: null,
  service: SERVICE_MINE,
  genre: null,
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
export function parseFilters(params: URLSearchParams): BrowseFilters {
  const duration = params.get("duration");
  const maxDuration =
    duration !== null && /^\d{1,3}$/.test(duration) && Number(duration) >= 1
      ? Number(duration)
      : null;
  const service = params.get("service") ?? "";
  const sort = params.get("sort");
  return {
    query: (params.get("q") ?? "").slice(0, MAX_QUERY),
    maxDuration: maxDuration !== null && maxDuration <= MAX_RUNTIME ? maxDuration : null,
    service: /^(all|\d{1,6})$/.test(service) ? service : SERVICE_MINE,
    genre: params.get("genre")?.slice(0, 60) || null,
    hideSeen: params.get("seen") === "1",
    sort: LIST_SORTS.includes(sort as BrowseSort) ? (sort as BrowseSort) : DEFAULT_FILTERS.sort,
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

/** The query string (without `?`) holding only what differs from the defaults. */
export function serializeFilters(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.maxDuration !== null) params.set("duration", String(filters.maxDuration));
  if (filters.service !== DEFAULT_FILTERS.service) params.set("service", filters.service);
  if (filters.genre) params.set("genre", filters.genre);
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
  if (film.confidence === null) return PENDING;
  if (film.confidence < 1 || film.tmdbId === null) return FLAGGED;
  if (detail === undefined) return PENDING;
  if (detail === "failed") return FLAGGED;

  if (filters.maxDuration !== null) {
    if (detail.runtime === null || detail.runtime > filters.maxDuration) return HIDE;
  }
  if (filters.genre && !detail.genres.includes(filters.genre)) return HIDE;

  if (filters.service === SERVICE_ANY) return SHOW;
  if (detail.availabilityStatus === "unknown") return FLAGGED;
  const onService =
    filters.service === SERVICE_MINE
      ? availabilityOn(detail, services) === "available"
      : hasStream(detail, filters.service);
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

/** Genres of the films loaded so far, for the genre filter. */
export function genresOf(details: Iterable<DetailState>): string[] {
  const genres = new Set<string>();
  for (const detail of details) {
    if (typeof detail === "object") detail.genres.forEach((genre) => genres.add(genre));
  }
  return [...genres].sort((a, b) => collator.compare(a, b));
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
