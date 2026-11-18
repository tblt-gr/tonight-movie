import type { DetailState } from "@/lib/browse";
import { mapLimit } from "@/lib/browse-client";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails } from "@/lib/types";

const FETCH_CONCURRENCY = 4;

export type ListOffersDeps = {
  /** Matches the films whose `confidence` is still `null`, then returns the refreshed records. */
  resolve: (keys: string[]) => Promise<StoredFilm[]>;
  fetchDetail: (tmdbId: number, signal: AbortSignal) => Promise<MovieDetails>;
};

export type ListOffersProgress = { done: number; total: number };

type Entry = { tmdbId: number } | null;

/**
 * Loads the details of every film of a list, so the offers of the whole list can be counted.
 * Returns one entry per distinct film: a film that is not matched, or whose lookup failed, is
 * `null`. Details already in `details` are reused, and `details` is filled as lookups settle.
 */
export async function loadListOffers({
  films,
  details,
  deps,
  signal,
  onProgress,
}: {
  films: StoredFilm[];
  details: Map<number, DetailState>;
  deps: ListOffersDeps;
  signal: AbortSignal;
  onProgress: (progress: ListOffersProgress) => void;
}): Promise<Array<MovieDetails | null>> {
  let current = films;
  const unresolved = films.filter((film) => film.confidence === null).map((film) => film.key);
  if (unresolved.length > 0 && !signal.aborted) {
    const fresh = new Map((await deps.resolve(unresolved)).map((film) => [film.key, film]));
    current = films.map((film) => fresh.get(film.key) ?? film);
  }

  const entries: Entry[] = [];
  const ids = new Set<number>();
  for (const film of current) {
    if (film.confidence !== 1 || film.tmdbId === null) {
      entries.push(null);
    } else if (!ids.has(film.tmdbId)) {
      ids.add(film.tmdbId);
      entries.push({ tmdbId: film.tmdbId });
    }
  }

  const total = entries.length;
  const wanted = [...ids].filter((id) => typeof details.get(id) !== "object");
  let done = total - wanted.length;
  onProgress({ done, total });

  await mapLimit(
    wanted,
    FETCH_CONCURRENCY,
    async (id) => {
      try {
        details.set(id, await deps.fetchDetail(id, signal));
      } catch {
        if (signal.aborted) return;
        details.set(id, "failed");
      }
      done += 1;
      onProgress({ done, total });
    },
    signal,
  );

  return entries.map((entry) => {
    const detail = entry ? details.get(entry.tmdbId) : undefined;
    return typeof detail === "object" ? detail : null;
  });
}
