import { describe, expect, it, vi } from "vitest";
import type { DetailState } from "@/lib/browse";
import { loadListOffers, type ListOffersDeps } from "@/lib/list-offers";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails } from "@/lib/types";

const film = (key: string, patch: Partial<StoredFilm> = {}): StoredFilm => ({
  key,
  title: key,
  year: 2000,
  tmdbId: null,
  confidence: 1,
  lists: ["l"],
  seen: false,
  ...patch,
});

const matched = (key: string, tmdbId: number) => film(key, { tmdbId });

const detail = (tmdbId: number): MovieDetails => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  originalTitle: null,
  year: 2000,
  poster: null,
  rating: null,
  overview: null,
  runtime: null,
  genres: [],
  directors: [],
  cast: [],
  offers: [],
  availabilityStatus: "verified",
  offersUrl: null,
  trailer: null,
});

function setup(overrides: Partial<ListOffersDeps> = {}) {
  const deps: ListOffersDeps = {
    resolve: vi.fn(async () => []),
    fetchDetail: vi.fn(async (id: number) => detail(id)),
    ...overrides,
  };
  const details = new Map<number, DetailState>();
  const failedKeys = new Set<string>();
  const onProgress = vi.fn();
  const run = (films: StoredFilm[], signal = new AbortController().signal) =>
    loadListOffers({ films, details, failedKeys, deps, signal, onProgress });
  return { deps, details, failedKeys, onProgress, run };
}

describe("loadListOffers", () => {
  it("reuses details already loaded", async () => {
    const { deps, details, run } = setup();
    details.set(1, detail(1));
    const result = await run([matched("a", 1)]);
    expect(deps.fetchDetail).not.toHaveBeenCalled();
    expect(result).toEqual([detail(1)]);
  });

  it("fetches missing details and fills the map", async () => {
    const { details, run } = setup();
    const result = await run([matched("a", 1)]);
    expect(result).toEqual([detail(1)]);
    expect(details.get(1)).toEqual(detail(1));
  });

  it("counts a duplicated tmdbId once", async () => {
    const { deps, run } = setup();
    const result = await run([matched("a", 1), matched("b", 1)]);
    expect(result).toHaveLength(1);
    expect(deps.fetchDetail).toHaveBeenCalledTimes(1);
  });

  it("returns null for an unmatched film without a lookup", async () => {
    const { deps, run } = setup();
    const result = await run([film("a", { confidence: 0 }), film("b", { tmdbId: null })]);
    expect(result).toEqual([null, null]);
    expect(deps.fetchDetail).not.toHaveBeenCalled();
  });

  it("resolves films never matched, then uses the refreshed record", async () => {
    const resolve = vi.fn(async () => [matched("a", 7)]);
    const { deps, run } = setup({ resolve });
    const result = await run([film("a", { confidence: null })]);
    expect(resolve).toHaveBeenCalledWith(["a"]);
    expect(deps.fetchDetail).toHaveBeenCalledWith(7, expect.anything());
    expect(result).toEqual([detail(7)]);
  });

  it("marks a film whose search stayed unresolved as failed", async () => {
    const resolve = vi.fn(async () => [film("a", { confidence: null })]);
    const { failedKeys, run } = setup({ resolve });
    await run([film("a", { confidence: null })]);
    expect([...failedKeys]).toEqual(["a"]);
  });

  it("clears a failed mark once the film is matched", async () => {
    const resolve = vi.fn(async () => [matched("a", 7)]);
    const { failedKeys, run } = setup({ resolve });
    failedKeys.add("a");
    await run([film("a", { confidence: null })]);
    expect(failedKeys.has("a")).toBe(false);
  });

  it("leaves failed marks alone when aborted while resolving", async () => {
    const controller = new AbortController();
    const resolve = vi.fn(async () => {
      controller.abort();
      return [film("a", { confidence: null })];
    });
    const { failedKeys, run } = setup({ resolve });
    await run([film("a", { confidence: null })], controller.signal);
    expect(failedKeys.size).toBe(0);
  });

  it("turns a failed lookup into null and still finishes", async () => {
    const { details, run } = setup({
      fetchDetail: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const result = await run([matched("a", 1)]);
    expect(result).toEqual([null]);
    expect(details.get(1)).toBe("failed");
  });

  it("retries a lookup that failed earlier", async () => {
    const { deps, details, run } = setup();
    details.set(1, "failed");
    const result = await run([matched("a", 1)]);
    expect(deps.fetchDetail).toHaveBeenCalledTimes(1);
    expect(result).toEqual([detail(1)]);
  });

  it("stops when aborted", async () => {
    const { deps, run } = setup();
    const controller = new AbortController();
    controller.abort();
    await run([matched("a", 1)], controller.signal);
    expect(deps.fetchDetail).not.toHaveBeenCalled();
  });

  it("reports progress up to the total", async () => {
    const { onProgress, run } = setup();
    await run([matched("a", 1), matched("b", 2), film("c", { confidence: 0 })]);
    const last = onProgress.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ done: 3, total: 3, entries: [detail(1), detail(2), null] });
  });

  it("offers the entries loaded so far with each progress report", async () => {
    const { onProgress, details, run } = setup();
    details.set(1, detail(1));
    await run([matched("a", 1), matched("b", 2)]);
    expect(onProgress.mock.calls[0][0]).toEqual({ done: 1, total: 2, entries: [detail(1), null] });
  });

  it("reports an empty list once", async () => {
    const { onProgress, run } = setup();
    expect(await run([])).toEqual([]);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ done: 0, total: 0, entries: [] });
  });
});
