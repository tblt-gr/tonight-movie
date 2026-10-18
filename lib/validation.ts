import { ApiFailure } from "@/lib/errors";
import { MAX_GENRES } from "@/lib/genres";
import type { DiscoverFilters } from "@/lib/types";

export const MAX_PAGE = 500;
export const MAX_PROVIDERS = 20;
export const MAX_RUNTIME = 600;
const MAX_TITLE_LENGTH = 100;
const FIRST_FILM_YEAR = 1888;
const MAX_FUTURE_YEARS = 5;

export const DISCOVER_SORTS = ["popularity", "rating", "year"] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];

const bad = (message: string) => new ApiFailure("bad_request", 400, message);

function integer(value: string, name: string, min: number, max: number): number {
  if (!/^\d{1,9}$/.test(value)) throw bad(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw bad(`${name} must be between ${min} and ${max}`);
  return parsed;
}

/** Rejects unknown and repeated parameters so nothing unexpected reaches TMDB. */
function pick(searchParams: URLSearchParams, allowed: readonly string[]) {
  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (!allowed.includes(key)) throw bad(`Unknown parameter: ${key}`);
    if (seen.has(key)) throw bad(`Repeated parameter: ${key}`);
    seen.add(key);
  }
  return (name: string) => searchParams.get(name);
}

export function parseSearch(searchParams: URLSearchParams) {
  const get = pick(searchParams, ["title", "year"]);
  // Normalized so equivalent searches share one cache entry.
  const title = (get("title") ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  if (!title) throw bad("title is required");
  if (title.length > MAX_TITLE_LENGTH) {
    throw bad(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  const rawYear = get("year");
  const year =
    rawYear === null
      ? null
      : integer(rawYear, "year", FIRST_FILM_YEAR, new Date().getFullYear() + MAX_FUTURE_YEARS);
  return { title, year };
}

export function parseMovieId(id: string): number {
  return integer(id, "id", 1, 999_999_999);
}

export function parseNoParams(searchParams: URLSearchParams) {
  pick(searchParams, []);
}

function genreList(raw: string): number[] {
  const parts = raw.split(",");
  if (parts.length > MAX_GENRES) throw bad(`genres accepts at most ${MAX_GENRES} ids`);
  return [...new Set(parts.map((part) => integer(part, "genres", 1, 999_999)))].sort(
    (a, b) => a - b,
  );
}

export function parseDiscover(searchParams: URLSearchParams) {
  const get = pick(searchParams, [
    "providers",
    "maxRuntime",
    "minRuntime",
    "minRating",
    "minYear",
    "maxYear",
    "genres",
    "page",
    "sort",
  ]);
  const rawProviders = get("providers");
  if (!rawProviders) throw bad("providers is required");
  const parts = rawProviders.split(",");
  if (parts.length > MAX_PROVIDERS) {
    throw bad(`providers accepts at most ${MAX_PROVIDERS} ids`);
  }
  const providers = [...new Set(parts.map((part) => integer(part, "providers", 1, 999_999)))].sort(
    (a, b) => a - b,
  );
  const rawRuntime = get("maxRuntime");
  const rawMinRuntime = get("minRuntime");
  const rawRating = get("minRating");
  const rawMinYear = get("minYear");
  const rawMaxYear = get("maxYear");
  const rawGenres = get("genres");
  const lastYear = new Date().getFullYear() + MAX_FUTURE_YEARS;
  if (rawRating !== null && !/^(\d|10)(\.5)?$/.test(rawRating)) throw bad("minRating is invalid");
  const rawPage = get("page");
  const sort = get("sort") ?? "popularity";
  if (!DISCOVER_SORTS.includes(sort as DiscoverSort)) throw bad("sort is not supported");
  return {
    providers,
    maxRuntime: rawRuntime === null ? null : integer(rawRuntime, "maxRuntime", 1, MAX_RUNTIME),
    filters: {
      minRuntime:
        rawMinRuntime === null ? null : integer(rawMinRuntime, "minRuntime", 1, MAX_RUNTIME),
      minRating: rawRating === null ? null : Number(rawRating),
      minYear:
        rawMinYear === null ? null : integer(rawMinYear, "minYear", FIRST_FILM_YEAR, lastYear),
      maxYear:
        rawMaxYear === null ? null : integer(rawMaxYear, "maxYear", FIRST_FILM_YEAR, lastYear),
      genres: rawGenres === null ? [] : genreList(rawGenres),
    } satisfies DiscoverFilters,
    page: rawPage === null ? 1 : integer(rawPage, "page", 1, MAX_PAGE),
    sort: sort as DiscoverSort,
  };
}
