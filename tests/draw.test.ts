import { describe, expect, it } from "vitest";
import { availabilityOn } from "@/lib/catalog";
import {
  CONCURRENCY,
  MAX_CANDIDATES,
  MAX_MISSES,
  SERVICES_SOURCE_ID,
  TARGET_AVAILABLE,
  drawFilm,
  effectiveSources,
  tmdbKey,
  type DrawDeps,
} from "@/lib/draw";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails, Offer } from "@/lib/types";

const offer = (id: string, type = "FLATRATE"): Offer => ({
  id,
  name: id,
  icon: null,
  type,
  url: null,
});

function details(tmdbId: number, patch: Partial<MovieDetails> = {}): MovieDetails {
  return {
    tmdbId,
    title: `Film ${tmdbId}`,
    originalTitle: null,
    year: 2000 + tmdbId,
    poster: null,
    rating: null,
    overview: null,
    runtime: 100,
    genres: [],
    directors: [],
    cast: [],
    offers: [offer("8")],
    availabilityStatus: "verified",
    offersUrl: null,
    ...patch,
  };
}

function stored(tmdbId: number, patch: Partial<StoredFilm> = {}): StoredFilm {
  return {
    key: `k${tmdbId}`,
    title: `Film ${tmdbId}`,
    year: 2000 + tmdbId,
    tmdbId,
    confidence: 1,
    lists: ["watchlist"],
    seen: false,
    ...patch,
  };
}

const lists = [{ id: "watchlist" }, { id: "liked" }, { id: "own" }];
const settings = {
  services: ["8"],
  sources: ["watchlist"],
  minDuration: null,
  maxDuration: null,
  minRating: null,
  minYear: null,
  maxYear: null,
  genres: [] as string[],
  excludeSeen: true,
  recentDraws: [] as string[],
};

/** Returns 0 for the first `calls` draws (the shuffle), then `value` (the final pick). */
const randomAfter = (calls: number, value: number) => {
  let count = 0;
  return () => (count++ < calls ? 0 : value);
};

function makeDeps(catalog: Record<number, MovieDetails>, patch: Partial<DrawDeps> = {}) {
  const calls = { details: [] as number[], search: 0, discover: [] as number[] };
  const deps: DrawDeps = {
    search: async () => {
      calls.search += 1;
      return [];
    },
    getDetails: async (id) => {
      calls.details.push(id);
      if (!catalog[id]) throw new Error("boom");
      return catalog[id];
    },
    discover: async (_providers, _max, page) => {
      calls.discover.push(page);
      return { page, totalPages: 0, results: [] };
    },
    random: () => 0,
    ...patch,
  };
  return { deps, calls };
}

describe("availabilityOn", () => {
  const services = new Set(["8"]);
  it("counts only streaming offers", () => {
    expect(
      availabilityOn(
        { offers: [offer("8", "RENT"), offer("8", "BUY")], availabilityStatus: "verified" },
        services,
      ),
    ).toBe("unavailable");
    expect(
      availabilityOn({ offers: [offer("8", "ADS")], availabilityStatus: "verified" }, services),
    ).toBe("available");
  });

  it("reports missing offer data as unknown, not unavailable", () => {
    expect(availabilityOn({ offers: [], availabilityStatus: "unknown" }, services)).toBe("unknown");
  });
});

describe("effectiveSources", () => {
  it("defaults to the watchlist when imported", () => {
    expect(effectiveSources([], lists)).toEqual(["watchlist"]);
  });

  it("defaults to all films on my services without a watchlist", () => {
    expect(effectiveSources([], [{ id: "own" }])).toEqual([SERVICES_SOURCE_ID]);
  });

  it("drops lists that no longer exist", () => {
    expect(effectiveSources(["gone", "own"], lists)).toEqual(["own"]);
  });
});

describe("drawFilm from lists", () => {
  it("returns a film available on a selected service", async () => {
    const { deps } = makeDeps({
      1: details(1, { offers: [offer("9")] }),
      2: details(2),
    });
    const result = await drawFilm({ settings, films: [stored(1), stored(2)], lists }, deps);
    expect(result).toMatchObject({ status: "found", key: "k2" });
  });

  it("does not count rent and buy offers", async () => {
    const { deps } = makeDeps({ 1: details(1, { offers: [offer("8", "RENT")] }) });
    const result = await drawFilm({ settings, films: [stored(1)], lists }, deps);
    expect(result).toMatchObject({ status: "none", reason: "nothing-available" });
  });

  it("skips À vérifier films", async () => {
    const { deps } = makeDeps({
      1: details(1, { offers: [], availabilityStatus: "unknown" }),
    });
    const result = await drawFilm({ settings, films: [stored(1)], lists }, deps);
    expect(result).toMatchObject({ status: "none", reason: "nothing-available" });
  });

  it("draws from the union of several sources", async () => {
    const films = [
      stored(1, { lists: ["watchlist"] }),
      stored(2, { lists: ["own"] }),
      stored(3, { lists: ["liked"] }),
    ];
    const { deps } = makeDeps({ 1: details(1), 2: details(2), 3: details(3) });
    const found = new Set<string>();
    for (const value of [0, 0.4, 0.99]) {
      const result = await drawFilm(
        { settings: { ...settings, sources: ["watchlist", "own"] }, films, lists },
        { ...deps, random: randomAfter(1, value) },
      );
      if (result.status === "found") found.add(result.key);
    }
    expect(found.size).toBeGreaterThan(1);
    expect(found.has("k3")).toBe(false);
  });

  it("respects the duration limit and skips an unknown runtime", async () => {
    const { deps } = makeDeps({
      1: details(1, { runtime: 150 }),
      2: details(2, { runtime: null }),
      3: details(3, { runtime: 90 }),
    });
    const result = await drawFilm(
      {
        settings: { ...settings, maxDuration: 120 },
        films: [stored(1), stored(2), stored(3)],
        lists,
      },
      deps,
    );
    expect(result).toMatchObject({ status: "found", key: "k3" });
  });

  it("applies the minimum runtime, rating, years and genres", async () => {
    const { deps } = makeDeps({
      1: details(1, { runtime: 70, rating: 8, year: 2010, genres: ["Drame"] }),
      2: details(2, { runtime: 110, rating: 5, year: 2010, genres: ["Drame"] }),
      3: details(3, { runtime: 110, rating: 8, year: 1980, genres: ["Drame"] }),
      4: details(4, { runtime: 110, rating: 8, year: 2010, genres: ["Comédie"] }),
      5: details(5, { runtime: 110, rating: null, year: 2010, genres: ["Drame"] }),
      6: details(6, { runtime: 110, rating: 8, year: 2010, genres: ["Drame", "Crime"] }),
    });
    const result = await drawFilm(
      {
        settings: {
          ...settings,
          minDuration: 90,
          minRating: 7,
          minYear: 2000,
          maxYear: 2020,
          genres: ["Drame"],
        },
        films: [1, 2, 3, 4, 5, 6].map((id) => stored(id)),
        lists,
      },
      deps,
    );
    expect(result).toMatchObject({ status: "found", key: "k6" });
  });

  it("reports no-match when only the fine filters reject films", async () => {
    const { deps } = makeDeps({ 1: details(1, { rating: 4 }) });
    const result = await drawFilm(
      { settings: { ...settings, minRating: 8 }, films: [stored(1)], lists },
      deps,
    );
    expect(result).toMatchObject({ status: "none", reason: "no-match" });
  });

  it("keeps an unknown runtime when there is no limit", async () => {
    const { deps } = makeDeps({ 1: details(1, { runtime: null }) });
    const result = await drawFilm({ settings, films: [stored(1)], lists }, deps);
    expect(result.status).toBe("found");
  });

  it("reports all-too-long", async () => {
    const { deps } = makeDeps({ 1: details(1, { runtime: 200 }) });
    const result = await drawFilm(
      { settings: { ...settings, maxDuration: 90 }, films: [stored(1)], lists },
      deps,
    );
    expect(result).toMatchObject({ status: "none", reason: "all-too-long" });
  });

  it("excludes seen films by TMDB id and by title and year", async () => {
    const films = [
      stored(1),
      stored(2, { lists: [], seen: true }),
      stored(3, { tmdbId: null, confidence: null, title: "Le Film 3", year: 2003 }),
      stored(4, { lists: [], seen: true, tmdbId: null, title: "Film 3", year: 2003 }),
    ];
    const { deps, calls } = makeDeps(
      { 1: details(1, { offers: [offer("9")] }), 3: details(3) },
      { search: async () => [{ ...details(3), title: "Film 3" }] },
    );
    const result = await drawFilm(
      { settings: { ...settings, sources: ["watchlist"] }, films, lists },
      deps,
    );
    // 2 is seen by id (and not in a list); film 3 matches the seen title and year.
    expect(result).toMatchObject({ status: "none", reason: "nothing-available" });
    expect(calls.details).not.toContain(3);

    const byId = await drawFilm(
      { settings, films: [stored(5, { seen: true }), stored(1, { tmdbId: 5 })], lists },
      makeDeps({ 5: details(5) }).deps,
    );
    expect(byId).toMatchObject({ status: "none", reason: "all-seen" });
  });

  it("keeps seen films when the option is off", async () => {
    const { deps } = makeDeps({ 1: details(1) });
    const result = await drawFilm(
      {
        settings: { ...settings, excludeSeen: false },
        films: [stored(1, { seen: true })],
        lists,
      },
      deps,
    );
    expect(result.status).toBe("found");
  });

  it("never draws weak matches", async () => {
    const { deps, calls } = makeDeps({ 1: details(1), 2: details(2) });
    const result = await drawFilm(
      {
        settings,
        films: [stored(1, { confidence: 0.5 }), stored(2, { tmdbId: null, confidence: 0 })],
        lists,
      },
      deps,
    );
    expect(result.status).toBe("none");
    expect(calls.details).toEqual([]);
  });

  it("matches an unresolved film lazily and rejects a weak result", async () => {
    const film = stored(1, { tmdbId: null, confidence: null });
    const strong = makeDeps(
      { 1: details(1) },
      { search: async () => [{ ...details(1), title: "Film 1" }] },
    );
    expect(await drawFilm({ settings, films: [film], lists }, strong.deps)).toMatchObject({
      status: "found",
    });

    const weak = makeDeps({ 1: details(1) }, { search: async () => [] });
    expect(await drawFilm({ settings, films: [film], lists }, weak.deps)).toMatchObject({
      status: "none",
    });
  });

  it("returns no-candidates for an empty source", async () => {
    const { deps } = makeDeps({});
    const result = await drawFilm({ settings, films: [], lists }, deps);
    expect(result).toEqual({ status: "none", reason: "no-candidates", attempts: 0 });
  });

  it("skips a TMDB error and carries on", async () => {
    const { deps } = makeDeps({ 2: details(2) });
    const result = await drawFilm({ settings, films: [stored(1), stored(2)], lists }, deps);
    expect(result).toMatchObject({ status: "found", key: "k2" });
  });

  it("stops after repeated TMDB errors without throwing", async () => {
    const films = Array.from({ length: 100 }, (_, index) => stored(index + 1));
    const { deps, calls } = makeDeps({});
    const result = await drawFilm({ settings, films, lists }, deps);
    expect(result.status).toBe("none");
    expect(calls.details.length).toBeGreaterThanOrEqual(MAX_MISSES);
    expect(calls.details.length).toBeLessThan(MAX_MISSES + CONCURRENCY);
  });

  it("does not draw the last five films again", async () => {
    const films = [1, 2, 3, 4, 5, 6].map((id) => stored(id));
    const { deps } = makeDeps(Object.fromEntries(films.map((f) => [f.tmdbId, details(f.tmdbId!)])));
    const recentDraws = ["k1", "k2", "k3", "k4", "k5"];
    for (const value of [0, 0.5, 0.99]) {
      const result = await drawFilm(
        { settings: { ...settings, recentDraws }, films, lists },
        { ...deps, random: () => value },
      );
      expect(result).toMatchObject({ status: "found", key: "k6" });
    }
  });

  it("returns none rather than repeating the only film", async () => {
    const { deps } = makeDeps({ 1: details(1) });
    const result = await drawFilm(
      { settings: { ...settings, recentDraws: ["k1"] }, films: [stored(1)], lists },
      deps,
    );
    expect(result).toMatchObject({ status: "none", reason: "no-candidates" });
  });
});

describe("drawFilm from all films on my services", () => {
  const global = { ...settings, sources: [SERVICES_SOURCE_ID] };

  it("picks a random page up to the 500 cap, then a random item", async () => {
    const calls: Array<[number[], number | null, number]> = [];
    const { deps } = makeDeps(
      { 7: details(7), 8: details(8) },
      {
        random: () => 0.999,
        discover: async (providers, max, page) => {
          calls.push([providers, max, page]);
          return {
            page,
            totalPages: 500,
            results: [details(7), details(8)],
          };
        },
      },
    );
    const result = await drawFilm(
      { settings: { ...global, maxDuration: 120, services: ["8", "119"] }, films: [], lists: [] },
      deps,
    );
    expect(calls[0]).toEqual([[8, 119], 120, 500]);
    expect(result.status === "found" && [tmdbKey(7), tmdbKey(8)]).toContain(
      result.status === "found" ? result.key : "",
    );
  });

  it("narrows the page range once TMDB reports fewer pages", async () => {
    const pages: number[] = [];
    const { deps } = makeDeps(
      { 1: details(1) },
      {
        random: () => 0.9,
        discover: async (_p, _m, page) => {
          pages.push(page);
          return page > 3
            ? { page, totalPages: 3, results: [] }
            : { page, totalPages: 3, results: [details(1)] };
        },
      },
    );
    const result = await drawFilm({ settings: global, films: [], lists: [] }, deps);
    expect(pages).toEqual([451, 3]);
    expect(result.status).toBe("found");
  });

  it("never returns a film outside the services or above the runtime limit", async () => {
    const { deps } = makeDeps(
      {
        1: details(1, { offers: [offer("9")] }),
        2: details(2, { runtime: 200 }),
        3: details(3),
      },
      {
        discover: async (_p, _m, page) => ({
          page,
          totalPages: 1,
          results: [details(1), details(2), details(3)],
        }),
      },
    );
    const result = await drawFilm(
      { settings: { ...global, maxDuration: 120 }, films: [], lists: [] },
      deps,
    );
    expect(result).toMatchObject({ status: "found", key: tmdbKey(3) });
  });

  it("excludes seen films and recent draws", async () => {
    const { deps } = makeDeps(
      { 1: details(1), 2: details(2), 3: details(3) },
      {
        discover: async (_p, _m, page) => ({
          page,
          totalPages: 1,
          results: [details(1), details(2), details(3)],
        }),
      },
    );
    const result = await drawFilm(
      {
        settings: { ...global, recentDraws: [tmdbKey(1)] },
        films: [stored(2, { lists: [], seen: true })],
        lists: [],
      },
      deps,
    );
    expect(result).toMatchObject({ status: "found", key: tmdbKey(3) });
  });

  it("survives a discover error", async () => {
    const { deps } = makeDeps(
      {},
      {
        discover: async () => {
          throw new Error("down");
        },
      },
    );
    const result = await drawFilm({ settings: global, films: [], lists: [] }, deps);
    expect(result).toMatchObject({ status: "none", reason: "no-candidates" });
  });

  it("combines with a list source", async () => {
    const { deps, calls } = makeDeps(
      { 1: details(1), 9: details(9) },
      {
        discover: async (_p, _m, page) => ({ page, totalPages: 1, results: [details(9)] }),
      },
    );
    const result = await drawFilm(
      {
        settings: { ...settings, sources: ["watchlist", SERVICES_SOURCE_ID] },
        films: [stored(1)],
        lists,
      },
      { ...deps, random: () => 0.9 },
    );
    expect(result.status).toBe("found");
    expect(calls.details.sort()).toEqual([1, 9]);
  });
});

describe("drawFilm scanning", () => {
  const bigList = (count: number) => Array.from({ length: count }, (_, index) => stored(index + 1));
  const seeded = () => {
    let seed = 42;
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  };

  it("finds the few available films of a big list", async () => {
    const catalog: Record<number, MovieDetails> = {};
    for (let id = 1; id <= 300; id += 1) {
      catalog[id] = details(id, { offers: [offer(id % 100 === 0 ? "8" : "9")] });
    }
    for (const random of [seeded(), () => 0, () => 0.99]) {
      const { deps } = makeDeps(catalog, { random });
      const result = await drawFilm({ settings, films: bigList(300), lists }, deps);
      expect(result.status).toBe("found");
      if (result.status === "found") expect(result.film.tmdbId % 100).toBe(0);
    }
  });

  it("never judges more than the concurrency cap at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const { deps } = makeDeps(
      {},
      {
        getDetails: async (id) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight -= 1;
          return details(id, { offers: [offer("9")] });
        },
      },
    );
    await drawFilm({ settings, films: bigList(60), lists }, deps);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(CONCURRENCY);
  });

  it("stops scanning once enough available films are collected", async () => {
    const catalog = Object.fromEntries(
      bigList(100).map((film) => [film.tmdbId!, details(film.tmdbId!)]),
    );
    const { deps, calls } = makeDeps(catalog);
    const result = await drawFilm({ settings, films: bigList(100), lists }, deps);
    expect(result.status).toBe("found");
    expect(calls.details.length).toBeGreaterThanOrEqual(TARGET_AVAILABLE);
    expect(calls.details.length).toBeLessThan(TARGET_AVAILABLE + CONCURRENCY);
  });

  it("caps the candidates judged per draw", async () => {
    const catalog = Object.fromEntries(
      bigList(500).map((film) => [film.tmdbId!, details(film.tmdbId!, { offers: [offer("9")] })]),
    );
    const { deps, calls } = makeDeps(catalog);
    const result = await drawFilm({ settings, films: bigList(500), lists }, deps);
    expect(result).toMatchObject({ status: "none", reason: "nothing-available" });
    expect(calls.details).toHaveLength(MAX_CANDIDATES);
  });

  it("draws at random among the collected films", async () => {
    const catalog = Object.fromEntries(
      bigList(3).map((film) => [film.tmdbId!, details(film.tmdbId!)]),
    );
    const keys = new Set<string>();
    for (const value of [0, 0.4, 0.99]) {
      const { deps } = makeDeps(catalog, { random: randomAfter(2, value) });
      const result = await drawFilm({ settings, films: bigList(3), lists }, deps);
      if (result.status === "found") keys.add(result.key);
    }
    expect(keys.size).toBe(3);
  });

  it("does not repeat a film that is both in the list and on the services", async () => {
    const { deps, calls } = makeDeps(
      { 1: details(1) },
      { discover: async (_p, _m, page) => ({ page, totalPages: 1, results: [details(1)] }) },
    );
    await drawFilm(
      {
        settings: { ...settings, sources: ["watchlist", SERVICES_SOURCE_ID] },
        films: [stored(1)],
        lists,
      },
      { ...deps, random: () => 0.9 },
    );
    expect(calls.details).toEqual([1]);
  });
});
