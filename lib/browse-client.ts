import { fetchWithRetry } from "@/lib/fetch-retry";
import { DEFAULT_LOCALE, langParam, type Locale } from "@/lib/i18n/config";
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

const detailsKey = (tmdbId: number, lang: Locale) => `${lang}:${tmdbId}`;

const withLang = (url: string, lang: Locale) => {
  const param = langParam(lang);
  return param ? `${url}${url.includes("?") ? "&" : "?"}${param}` : url;
};

export const cachedDetails = (tmdbId: number, lang: Locale = DEFAULT_LOCALE) =>
  details.get(detailsKey(tmdbId, lang));

export async function fetchDetails(
  tmdbId: number,
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
): Promise<MovieDetails> {
  const known = cachedDetails(tmdbId, lang);
  if (known) return known;
  const fresh = await getJson<MovieDetails>(withLang(`/api/movie/${tmdbId}`, lang), signal);
  details.set(detailsKey(tmdbId, lang), fresh);
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
  return getJson<DiscoverResponse>(`/api/discover?${params}`, signal);
}

export async function fetchProviders(
  signal?: AbortSignal,
  lang: Locale = DEFAULT_LOCALE,
): Promise<Map<string, ProviderInfo>> {
  const { providers } = await getJson<ProvidersResponse>(withLang("/api/providers", lang), signal);
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
