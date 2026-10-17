import { fetchWithRetry } from "@/lib/fetch-retry";
import type { DiscoverSort } from "@/lib/validation";
import type { DiscoverResponse, MovieDetails, ProvidersResponse } from "@/lib/types";

/** GET JSON from the app's own routes, retrying a 429 or a temporary upstream error. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithRetry((...args) => fetch(...args), url, {
    signal,
    retryable: (status) => status >= 500,
  });
  return (await response.json()) as T;
}

/** Successful lookups only, kept for the session so a filter change never refetches. */
const details = new Map<number, MovieDetails>();

export const cachedDetails = (tmdbId: number) => details.get(tmdbId);

export async function fetchDetails(tmdbId: number, signal?: AbortSignal): Promise<MovieDetails> {
  const known = details.get(tmdbId);
  if (known) return known;
  const fresh = await getJson<MovieDetails>(`/api/movie/${tmdbId}`, signal);
  details.set(tmdbId, fresh);
  return fresh;
}

export function fetchDiscover(
  providers: number[],
  maxRuntime: number | null,
  page: number,
  sort: DiscoverSort,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ providers: providers.join(",") });
  if (maxRuntime !== null) params.set("maxRuntime", String(maxRuntime));
  params.set("page", String(page));
  params.set("sort", sort);
  return getJson<DiscoverResponse>(`/api/discover?${params}`, signal);
}

export async function fetchProviderNames(signal?: AbortSignal): Promise<Map<string, string>> {
  const { providers } = await getJson<ProvidersResponse>("/api/providers", signal);
  return new Map(providers.map((provider) => [provider.id, provider.name]));
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
