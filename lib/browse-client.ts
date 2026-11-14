import { tmdbClient, METADATA_TTL_MS } from "@/lib/tmdb-client";
import { DEFAULT_LOCALE, langParam, type Locale } from "@/lib/i18n/config";
import { DEFAULT_REGION, regionParam } from "@/lib/regions";
import type { DiscoverSort } from "@/lib/validation";
import type {
  DiscoverFilters,
  DiscoverResponse,
  MovieDetails,
  ProviderInfo,
  ProvidersResponse,
} from "@/lib/types";

/** Adds the page language and the country to a route URL; the defaults add nothing. */
const withContext = (url: string, lang: Locale, region: string) => {
  const params = [langParam(lang), regionParam(region)].filter(Boolean).join("&");
  return params ? `${url}${url.includes("?") ? "&" : "?"}${params}` : url;
};

export const cachedDetails = (
  tmdbId: number,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
) => tmdbClient.peekMovie(withContext(`/api/movie/${tmdbId}`, lang, region));

/** Whether the details and offers of a film are cached and fresh, so showing it needs no lookup. */
export const hasFreshDetails = (
  tmdbId: number,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
) => tmdbClient.hasFreshMovie(withContext(`/api/movie/${tmdbId}`, lang, region));

export async function fetchDetails(
  tmdbId: number,
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
): Promise<MovieDetails> {
  return tmdbClient.getMovie(withContext(`/api/movie/${tmdbId}`, lang, region), signal);
}

export function fetchDiscover(
  providers: number[],
  maxRuntime: number | null,
  page: number,
  sort: DiscoverSort,
  filters: DiscoverFilters,
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
) {
  const params = new URLSearchParams({ providers: providers.join(",") });
  if (maxRuntime !== null) params.set("maxRuntime", String(maxRuntime));
  if (filters.minRuntime !== null) params.set("minRuntime", String(filters.minRuntime));
  if (filters.minRating !== null) params.set("minRating", String(filters.minRating));
  if (filters.minYear !== null) params.set("minYear", String(filters.minYear));
  if (filters.maxYear !== null) params.set("maxYear", String(filters.maxYear));
  if (filters.genres.length > 0) params.set("genres", filters.genres.join(","));
  params.set("page", String(page));
  params.set("sort", sort);
  if (lang !== DEFAULT_LOCALE) params.set("lang", lang);
  if (region !== DEFAULT_REGION) params.set("region", region);
  return tmdbClient.get<DiscoverResponse>(`/api/discover?${params}`, undefined, signal);
}

export async function fetchProviders(
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
): Promise<Map<string, ProviderInfo>> {
  const { providers } = await tmdbClient.get<ProvidersResponse>(
    withContext("/api/providers", lang, region),
    METADATA_TTL_MS,
    signal,
  );
  return new Map(providers.map((provider) => [provider.id, provider]));
}

/** Runs `task` over `items` with a bounded number in flight; a rejected task is swallowed because each task records its own failure. */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length && !signal?.aborted) {
      const item = items[next++];
      await task(item).catch(() => undefined);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
