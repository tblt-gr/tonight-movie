import type { MovieSummary } from "@/lib/types";
import { MAX_RUNTIME } from "@/lib/validation";

/** Films per discover call are never sorted by duration, so the catalogue is read minute by minute. */
const PROBE_MINUTES = 30;

export type RuntimeWalk = {
  /** The next minute nobody has read yet. */
  next: number;
  /** The minute whose later pages are still to read, if any. */
  minute: number | null;
  page: number;
  totalPages: number;
};

export type WindowFetcher = (
  from: number,
  to: number,
  page: number,
) => Promise<{ results: MovieSummary[]; totalPages: number }>;

export type RuntimeBounds = { order: "asc" | "desc"; min: number; max: number };

export const runtimeBounds = (
  order: "asc" | "desc",
  minDuration: number | null,
  maxDuration: number | null,
): RuntimeBounds => ({ order, min: minDuration ?? 1, max: maxDuration ?? MAX_RUNTIME });

export const startWalk = ({ order, min, max }: RuntimeBounds): RuntimeWalk => ({
  next: order === "asc" ? min : max,
  minute: null,
  page: 0,
  totalPages: 0,
});

export const walkDone = (walk: RuntimeWalk, { min, max }: RuntimeBounds) =>
  walk.minute === null && (walk.next < min || walk.next > max);

/**
 * Reads the next films in exact duration order. Empty stretches of minutes are skipped with
 * one wide call; a stretch with films is then read one minute at a time, so the order holds
 * across pages and the first films of a long list arrive first.
 */
export async function walkStep(
  walk: RuntimeWalk,
  bounds: RuntimeBounds,
  fetchWindow: WindowFetcher,
): Promise<{ walk: RuntimeWalk; results: MovieSummary[] }> {
  const dir = bounds.order === "asc" ? 1 : -1;
  const inRange = (minute: number) => minute >= bounds.min && minute <= bounds.max;

  if (walk.minute !== null && walk.page < walk.totalPages) {
    const page = walk.page + 1;
    const response = await fetchWindow(walk.minute, walk.minute, page);
    const more = page < response.totalPages;
    return {
      walk: { ...walk, page, totalPages: response.totalPages, minute: more ? walk.minute : null },
      results: response.results,
    };
  }

  let next = walk.next;
  while (inRange(next)) {
    const far = Math.min(bounds.max, Math.max(bounds.min, next + dir * (PROBE_MINUTES - 1)));
    const probe = await fetchWindow(Math.min(next, far), Math.max(next, far), 1);
    if (probe.totalPages === 0) {
      next = far + dir;
      continue;
    }
    const minutes = Array.from({ length: Math.abs(far - next) + 1 }, (_, i) => next + dir * i);
    const pages = await Promise.all(minutes.map((minute) => fetchWindow(minute, minute, 1)));
    const results: MovieSummary[] = [];
    for (const [index, response] of pages.entries()) {
      results.push(...response.results);
      if (response.totalPages > 1) {
        return {
          walk: {
            next: minutes[index] + dir,
            minute: minutes[index],
            page: 1,
            totalPages: response.totalPages,
          },
          results,
        };
      }
    }
    return { walk: { next: far + dir, minute: null, page: 0, totalPages: 0 }, results };
  }
  return { walk: { ...walk, next }, results: [] };
}
