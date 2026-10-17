import { CONFIDENCE_VALUES, matchFilm, type SearchFn } from "@/lib/match";
import type { FilmInput } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";
import type { SearchResponse } from "@/lib/types";

export type Resolver = {
  getFilms(): Promise<StoredFilm[]>;
  upsertFilms(films: FilmInput[]): Promise<void>;
};

export type ResolveOptions = {
  /** Searches running at once. */
  concurrency?: number;
  /** Extra attempts after a failed search. */
  retries?: number;
  /** First backoff in milliseconds, doubled on each retry. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
};

const DEFAULTS = { concurrency: 3, retries: 2, baseDelayMs: 500 };

class NotRetryable extends Error {}

/** Calls the app's own `/api/search` route. A 4xx other than 429 means the request itself is wrong. */
export function fetchSearch(signal?: AbortSignal): SearchFn {
  return async (title, year) => {
    const params = new URLSearchParams({ title });
    if (year !== null) params.set("year", String(year));
    const response = await fetch(`/api/search?${params}`, { signal });
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new NotRetryable("Rejected search");
    }
    if (!response.ok) throw new Error("Search failed");
    return ((await response.json()) as SearchResponse).results;
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves the given film keys that were never matched and stores the outcome.
 * A film that already has a verdict is not searched again; a film whose search
 * keeps failing stays unresolved so a later call retries it.
 */
export async function resolveFilms(
  keys: string[],
  library: Resolver,
  search: SearchFn,
  options: ResolveOptions = {},
): Promise<void> {
  const { concurrency, retries, baseDelayMs } = { ...DEFAULTS, ...options };
  const sleep = options.sleep ?? wait;
  const wanted = new Set(keys);
  const pending = (await library.getFilms()).filter(
    (film) => wanted.has(film.key) && film.confidence === null,
  );

  async function withRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (error instanceof NotRetryable || attempt >= retries || options.signal?.aborted) {
          throw error;
        }
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }

  let next = 0;
  async function worker() {
    while (next < pending.length && !options.signal?.aborted) {
      const film = pending[next++];
      try {
        const match = await withRetry(() => matchFilm(film, search));
        await library.upsertFilms([
          {
            ...film,
            tmdbId: match.tmdbId,
            confidence: CONFIDENCE_VALUES[match.confidence],
            lists: [],
          },
        ]);
      } catch {
        // Left unresolved on purpose: only a verdict is recorded.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
}
