import { fetchWithRetry } from "@/lib/fetch-retry";
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

/** GET JSON from the app's own routes, retrying a 429 or a temporary upstream error. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithRetry((...args) => fetch(...args), url, {
    signal,
    retryable: (status) => status >= 500,
  });
  return (await response.json()) as T;
}

/** Successful lookups only, kept for the session so a filter change never refetches. */
const details = new Map<string, MovieDetails>();

const detailsKey = (tmdbId: number, lang: Locale, region: string) => `${lang}:${region}:${tmdbId}`;

/** Adds the page language and the country to a route URL; the defaults add nothing. */
const withContext = (url: string, lang: Locale, region: string) => {
  const params = [langParam(lang), regionParam(region)].filter(Boolean).join("&");
  return params ? `${url}${url.includes("?") ? "&" : "?"}${params}` : url;
};

export const cachedDetails = (
  tmdbId: number,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
) => details.get(detailsKey(tmdbId, lang, region));

export async function fetchDetails(
  tmdbId: number,
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
): Promise<MovieDetails> {
  const known = cachedDetails(tmdbId, lang, region);
  if (known) return known;
  const fresh = await getJson<MovieDetails>(
    withContext(`/api/movie/${tmdbId}`, lang, region),
    signal,
  );
  details.set(detailsKey(tmdbId, lang, region), fresh);
  return fresh;
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
  return getJson<DiscoverResponse>(`/api/discover?${params}`, signal);
}

export async function fetchProviders(
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
): Promise<Map<string, ProviderInfo>> {
  const { providers } = await getJson<ProvidersResponse>(
    withContext("/api/providers", lang, region),
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
