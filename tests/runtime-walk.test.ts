import { describe, expect, it } from "vitest";
import {
  runtimeBounds,
  startWalk,
  walkDone,
  walkStep,
  type RuntimeWalk,
  type WindowFetcher,
} from "@/lib/runtime-walk";
import type { MovieSummary } from "@/lib/types";

const film = (tmdbId: number): MovieSummary => ({ tmdbId }) as MovieSummary;

/** Films by exact runtime; `perPage` splits a minute over several pages. */
function catalogue(byMinute: Record<number, number[]>, perPage = 2) {
  const calls: [number, number, number][] = [];
  const fetchWindow: WindowFetcher = async (from, to, page) => {
    calls.push([from, to, page]);
    const ids = Object.entries(byMinute)
      .filter(([minute]) => Number(minute) >= from && Number(minute) <= to)
      .flatMap(([, list]) => list);
    return {
      results: ids.slice((page - 1) * perPage, page * perPage).map(film),
      totalPages: Math.ceil(ids.length / perPage),
    };
  };
  return { fetchWindow, calls };
}

async function readAll(order: "asc" | "desc", byMinute: Record<number, number[]>) {
  const { fetchWindow, calls } = catalogue(byMinute);
  const bounds = runtimeBounds(order, null, null);
  let walk: RuntimeWalk = startWalk(bounds);
  const ids: number[] = [];
  let steps = 0;
  while (!walkDone(walk, bounds) && steps++ < 100) {
    const step = await walkStep(walk, bounds, fetchWindow);
    walk = step.walk;
    ids.push(...step.results.map((m) => m.tmdbId));
  }
  return { ids, calls };
}

const CATALOGUE = { 52: [1], 90: [2, 3, 4], 91: [5], 140: [6, 7], 300: [8] };

describe("runtime walk", () => {
  it("reads the whole catalogue from the shortest film up", async () => {
    expect((await readAll("asc", CATALOGUE)).ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("reads it from the longest film down", async () => {
    expect((await readAll("desc", CATALOGUE)).ids).toEqual([8, 6, 7, 5, 2, 3, 4, 1]);
  });

  it("skips empty stretches with a single wide call", async () => {
    const { calls } = await readAll("asc", { 100: [1] });
    expect(calls.filter(([from, to]) => to - from > 0).length).toBeLessThan(25);
    expect(calls.length).toBeLessThan(60);
  });

  it("stays inside the chosen duration range", async () => {
    const { fetchWindow } = catalogue(CATALOGUE);
    const bounds = runtimeBounds("asc", 80, 100);
    let walk = startWalk(bounds);
    const ids: number[] = [];
    while (!walkDone(walk, bounds)) {
      const step = await walkStep(walk, bounds, fetchWindow);
      walk = step.walk;
      ids.push(...step.results.map((m) => m.tmdbId));
    }
    expect(ids).toEqual([2, 3, 4, 5]);
  });
});
