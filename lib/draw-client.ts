import {
  effectiveSources,
  shuffle,
  SERVICES_SOURCE_ID,
  type DrawDeps,
  type DrawInput,
} from "@/lib/draw";
import { fetchWithRetry, type RetryOptions } from "@/lib/fetch-retry";
import { isDrawable } from "@/lib/match";
import type { DiscoverResponse, MovieDetails, SearchResponse } from "@/lib/types";
import { MAX_PROVIDERS } from "@/lib/validation";

const LIST_POSTERS = 5;
const SERVICES_POSTERS = 14;

/**
 * The engine's TMDB access through the app's own routes. The engine swallows
 * failures, so the client counts calls to tell a dead network from an empty result.
 */
export function createDrawClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
  retry: Pick<RetryOptions, "sleep" | "baseDelayMs"> = {},
) {
  let succeeded = 0;
  let failed = 0;

  async function get<T>(url: string): Promise<T> {
    try {
      // Scanning fires bursts of requests, so a 429 is waited out instead of counted as a miss.
      const response = await fetchWithRetry(fetcher, url, retry);
      const body = (await response.json()) as T;
      succeeded += 1;
      return body;
    } catch (error) {
      failed += 1;
      throw error;
    }
  }

  const deps: Pick<DrawDeps, "search" | "getDetails" | "discover"> = {
    async search(title, year) {
      const params = new URLSearchParams({ title });
      if (year !== null) params.set("year", String(year));
      return (await get<SearchResponse>(`/api/search?${params}`)).results;
    },
    getDetails: (tmdbId) => get<MovieDetails>(`/api/movie/${tmdbId}`),
    discover(providers, maxRuntime, page) {
      const params = new URLSearchParams({ providers: providers.join(",") });
      if (maxRuntime !== null) params.set("maxRuntime", String(maxRuntime));
      params.set("page", String(page));
      return get<DiscoverResponse>(`/api/discover?${params}`);
    },
  };

  return { deps, isOutage: () => failed > 0 && succeeded === 0 };
}

/**
 * Posters to flash during the animation, taken from the same source as the draw: the
 * chosen lists' films, and popular films on the services for a global draw. Best effort.
 */
export async function collectSwapPosters(
  input: DrawInput,
  deps: Pick<DrawDeps, "getDetails" | "discover">,
  random: () => number = Math.random,
): Promise<string[]> {
  const sources = effectiveSources(input.settings.sources, input.lists);
  const listSources = new Set(sources.filter((id) => id !== SERVICES_SOURCE_ID));
  const providers = input.settings.services
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, MAX_PROVIDERS);

  const picks = shuffle(
    input.films.filter(
      (film) =>
        film.tmdbId !== null && isDrawable(film) && film.lists.some((id) => listSources.has(id)),
    ),
    random,
  ).slice(0, LIST_POSTERS);

  const posters = new Set<string>();
  const [details, popular] = await Promise.all([
    Promise.allSettled(picks.map((film) => deps.getDetails(film.tmdbId!))),
    sources.includes(SERVICES_SOURCE_ID) && providers.length > 0
      ? deps.discover(providers, input.settings.maxDuration, 1).catch(() => null)
      : null,
  ]);
  for (const result of details) {
    if (result.status === "fulfilled" && result.value.poster) posters.add(result.value.poster);
  }
  for (const movie of popular?.results.slice(0, SERVICES_POSTERS) ?? []) {
    if (movie.poster) posters.add(movie.poster);
  }
  return [...posters];
}
