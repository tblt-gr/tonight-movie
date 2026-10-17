import type { DiscoverSort } from "@/lib/validation";
import type { DiscoverResponse, MovieDetails, ProvidersResponse } from "@/lib/types";

const RETRIES = 3;
const BASE_DELAY_MS = 1500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET JSON from the app's own routes. The routes are rate limited per visitor, so a 429 or a
 * temporary upstream error is retried with a growing pause before the lookup is given up.
 */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { signal });
    if (response.ok) return (await response.json()) as T;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= RETRIES) throw new Error(`Request failed with ${response.status}`);
    await wait(BASE_DELAY_MS * 2 ** attempt);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }
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
