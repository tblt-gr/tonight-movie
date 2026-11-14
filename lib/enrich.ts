import type { Resolver } from "@/lib/resolve";
import type { FilmInput } from "@/lib/storage/library";
import type { FilmFacts } from "@/lib/storage/schema";

/** Below the 600 requests a minute a visitor may send, whatever the connection speed. */
const DEFAULT_INTERVAL_MS = 125;
const CONCURRENCY = 4;
/** Every write reads the whole library, so facts are saved in groups. */
const WRITE_BATCH = 25;

export type FactsFetcher = (tmdbId: number, signal?: AbortSignal) => Promise<FilmFacts>;

export type EnrichOptions = {
  signal?: AbortSignal;
  /**
   * Whether a film's details and offers are already at hand. A film with facts is looked up
   * again when they are not, so browsing does not have to wait for its offers.
   */
  isWarm?: (tmdbId: number) => Promise<boolean>;
  /** Minimum gap between two lookups. */
  intervalMs?: number;
  onProgress?: (done: number, total: number) => void;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Stores the runtime, rating and year of every matched film that has none yet, so a list
 * can be sorted later without a lookup, and warms the details and offers of the others.
 * A lookup that fails leaves the film as it was and a later call tries again.
 */
export async function enrichFilms(
  keys: string[],
  store: Resolver,
  fetchFacts: FactsFetcher,
  options: EnrichOptions = {},
): Promise<void> {
  const { signal, intervalMs = DEFAULT_INTERVAL_MS, isWarm, onProgress } = options;
  const wanted = new Set(keys);
  const matched = (await store.getFilms()).filter(
    (film) => wanted.has(film.key) && film.confidence === 1 && film.tmdbId !== null,
  );
  const pending: typeof matched = [];
  for (const film of matched) {
    if (signal?.aborted) break;
    if (!film.facts || (isWarm && !(await isWarm(film.tmdbId!)))) pending.push(film);
  }
  let next = 0;
  let done = 0;
  let slot = Date.now();
  let unsaved: FilmInput[] = [];
  const flush = async () => {
    const batch = unsaved;
    unsaved = [];
    if (batch.length > 0) await store.upsertFilms(batch);
  };

  async function worker() {
    while (next < pending.length && !signal?.aborted) {
      const film = pending[next++];
      const start = Math.max(slot, Date.now());
      slot = start + intervalMs;
      if (start > Date.now()) await wait(start - Date.now());
      if (signal?.aborted) return;
      try {
        const facts = await fetchFacts(film.tmdbId!, signal);
        if (!film.facts) unsaved.push({ ...film, facts, lists: [] });
        if (unsaved.length >= WRITE_BATCH) await flush();
      } catch {
        // Left without facts on purpose: only a read detail is recorded.
      }
      onProgress?.(++done, pending.length);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  } finally {
    // An abort or a failure still keeps what was read.
    await flush();
  }
}

export const factsOf = (detail: {
  runtime: number | null;
  rating: number | null;
  year: number | null;
}): FilmFacts => ({ runtime: detail.runtime, rating: detail.rating, year: detail.year });
