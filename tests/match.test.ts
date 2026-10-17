import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { isDrawable, matchFilm, needsCheck, normalizeTitle, type SearchFn } from "@/lib/match";
import { fetchSearch, resolveFilms } from "@/lib/resolve";
import { createLibrary } from "@/lib/storage/library";
import type { MovieSummary } from "@/lib/types";

const movie = (
  tmdbId: number,
  title: string,
  year: number | null,
  originalTitle: string | null = null,
): MovieSummary => ({ tmdbId, title, originalTitle, year, poster: null, rating: null });

/** Mimics TMDB: the year filter keeps only that year, no year returns everything. */
const catalog =
  (...movies: MovieSummary[]): SearchFn =>
  async (_title, year) =>
    year === null ? movies : movies.filter((m) => m.year === year);

describe("normalizeTitle", () => {
  it.each([
    ["Amélie", "amelie"],
    ["AMELIE", "amelie"],
    ["The Thing", "thing"],
    ["Le Fabuleux Destin d'Amélie Poulain", "fabuleux destin d amelie poulain"],
    ["L'Avventura", "avventura"],
    ["Se7en", "se7en"],
    ["Mad Max: Fury Road", "mad max fury road"],
    ["Cœur", "coeur"],
    ["Tom & Jerry", "tom and jerry"],
    ["The", "the"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });
});

describe("matchFilm", () => {
  it("is high when the normalized title and the year are equal", async () => {
    const search = catalog(movie(1, "Le Fabuleux Destin d’Amélie Poulain", 2001));
    expect(
      await matchFilm({ title: "le fabuleux destin d'amelie poulain", year: 2001 }, search),
    ).toEqual({ tmdbId: 1, confidence: "high" });
  });

  it("ignores articles and punctuation on both sides", async () => {
    const search = catalog(movie(7, "Thing", 1982));
    expect(await matchFilm({ title: "The Thing", year: 1982 }, search)).toEqual({
      tmdbId: 7,
      confidence: "high",
    });
  });

  it("accepts the original title", async () => {
    const search = catalog(movie(2, "Parasite", 2019, "기생충"));
    expect(await matchFilm({ title: "기생충", year: 2019 }, search)).toEqual({
      tmdbId: 2,
      confidence: "high",
    });
  });

  it("is low when only an alternative title was found", async () => {
    const search = catalog(movie(1, "Le Fabuleux Destin d’Amélie Poulain", 2001));
    expect(await matchFilm({ title: "Amélie", year: 2001 }, search)).toEqual({
      tmdbId: 1,
      confidence: "low",
    });
  });

  it("is low when the year is off by one", async () => {
    const search = catalog(movie(3, "Stalker", 1979));
    expect(await matchFilm({ title: "Stalker", year: 1980 }, search)).toEqual({
      tmdbId: 3,
      confidence: "low",
    });
    expect(await matchFilm({ title: "Stalker", year: 1978 }, search)).toEqual({
      tmdbId: 3,
      confidence: "low",
    });
  });

  it("is none when the year is further off and nothing else matches", async () => {
    const search = catalog(movie(3, "Stalker", 1979));
    expect(await matchFilm({ title: "Stalker", year: 1990 }, search)).toEqual({
      tmdbId: null,
      confidence: "none",
    });
  });

  it("separates remakes and same-title films by year", async () => {
    const search = catalog(
      movie(10, "Scarface", 1932),
      movie(11, "Scarface", 1983),
      movie(12, "Psycho", 1960),
      movie(13, "Psycho", 1998),
    );
    expect((await matchFilm({ title: "Scarface", year: 1983 }, search)).tmdbId).toBe(11);
    expect((await matchFilm({ title: "Scarface", year: 1932 }, search)).tmdbId).toBe(10);
    expect(await matchFilm({ title: "Psycho", year: 1998 }, search)).toEqual({
      tmdbId: 13,
      confidence: "high",
    });
  });

  it("prefers the exact year over a neighbouring one", async () => {
    const search = catalog(movie(20, "Heat", 1995), movie(21, "Heat", 1996));
    expect(await matchFilm({ title: "Heat", year: 1996 }, search)).toEqual({
      tmdbId: 21,
      confidence: "high",
    });
  });

  it("matches a film without a year only when unambiguous", async () => {
    const single = catalog(movie(30, "Stalker", 1979), movie(31, "Stalker 2", 2020));
    expect(await matchFilm({ title: "Stalker", year: null }, single)).toEqual({
      tmdbId: 30,
      confidence: "high",
    });
    const remakes = catalog(movie(10, "Scarface", 1932), movie(11, "Scarface", 1983));
    expect(await matchFilm({ title: "Scarface", year: null }, remakes)).toEqual({
      tmdbId: 10,
      confidence: "low",
    });
  });

  it("is low for a film without a year that only resembles a result", async () => {
    const search = catalog(movie(1, "Le Fabuleux Destin d’Amélie Poulain", 2001));
    expect(await matchFilm({ title: "Amélie", year: null }, search)).toEqual({
      tmdbId: 1,
      confidence: "low",
    });
  });

  it("is none without any result", async () => {
    expect(await matchFilm({ title: "Nope", year: 2000 }, catalog())).toEqual({
      tmdbId: null,
      confidence: "none",
    });
    expect(await matchFilm({ title: "Nope", year: null }, catalog())).toEqual({
      tmdbId: null,
      confidence: "none",
    });
  });

  it("propagates a search error instead of answering none", async () => {
    const search: SearchFn = async () => {
      throw new Error("down");
    };
    await expect(matchFilm({ title: "Stalker", year: 1979 }, search)).rejects.toThrow("down");
  });

  it("only the high confidence is drawable", () => {
    expect(isDrawable({ tmdbId: 1, confidence: 1 })).toBe(true);
    expect(isDrawable({ tmdbId: 1, confidence: 0.5 })).toBe(false);
    expect(isDrawable({ tmdbId: null, confidence: 0 })).toBe(false);
    expect(isDrawable({ tmdbId: null, confidence: null })).toBe(false);
    expect(needsCheck({ confidence: 0.5 })).toBe(true);
    expect(needsCheck({ confidence: 0 })).toBe(true);
    expect(needsCheck({ confidence: 1 })).toBe(false);
    expect(needsCheck({ confidence: null })).toBe(false);
  });
});

describe("resolveFilms", () => {
  const stored = (key: string, title: string, year: number | null) => ({
    key,
    title,
    year,
    tmdbId: null,
    confidence: null,
    lists: ["watchlist"],
    seen: false,
  });
  const setup = async () => {
    const library = createLibrary(() => new IDBFactory());
    await library.upsertFilms([
      stored("a", "Stalker", 1979),
      stored("b", "Nope", 2000),
      stored("c", "Heat", 1995),
    ]);
    return library;
  };
  const noSleep = async () => {};
  const find = async (library: Awaited<ReturnType<typeof setup>>, key: string) =>
    (await library.getFilms()).find((film) => film.key === key);

  it("stores the id and the confidence of each verdict", async () => {
    const library = await setup();
    const search = catalog(movie(3, "Stalker", 1979), movie(20, "Heat", 1995));
    await resolveFilms(["a", "b", "c"], library, search, { sleep: noSleep });
    expect(await find(library, "a")).toMatchObject({
      tmdbId: 3,
      confidence: 1,
      lists: ["watchlist"],
    });
    expect(await find(library, "b")).toMatchObject({ tmdbId: null, confidence: 0 });
    expect(await find(library, "c")).toMatchObject({ tmdbId: 20, confidence: 1 });
  });

  it("never searches a stored verdict again", async () => {
    const library = await setup();
    const search = vi.fn(catalog(movie(3, "Stalker", 1979)));
    await resolveFilms(["a", "b"], library, search, { sleep: noSleep });
    const calls = search.mock.calls.length;
    await resolveFilms(["a", "b"], library, search, { sleep: noSleep });
    expect(search.mock.calls.length).toBe(calls);
  });

  it("only resolves the requested keys", async () => {
    const library = await setup();
    const search = vi.fn(catalog(movie(3, "Stalker", 1979)));
    await resolveFilms(["a"], library, search, { sleep: noSleep });
    expect((await find(library, "c"))?.confidence).toBeNull();
  });

  it("retries with a growing backoff, then succeeds", async () => {
    const library = await setup();
    const inner = catalog(movie(3, "Stalker", 1979));
    let failures = 2;
    const search: SearchFn = async (title, year) => {
      if (failures-- > 0) throw new Error("busy");
      return inner(title, year);
    };
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    await resolveFilms(["a"], library, search, { sleep, baseDelayMs: 100 });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
    expect(await find(library, "a")).toMatchObject({ tmdbId: 3, confidence: 1 });
  });

  it("leaves a film unresolved, not as no match, when TMDB keeps failing", async () => {
    const library = await setup();
    const search: SearchFn = async () => {
      throw new Error("down");
    };
    await resolveFilms(["a"], library, search, { sleep: noSleep });
    expect(await find(library, "a")).toMatchObject({ tmdbId: null, confidence: null });
    const working = catalog(movie(3, "Stalker", 1979));
    await resolveFilms(["a"], library, working, { sleep: noSleep });
    expect(await find(library, "a")).toMatchObject({ tmdbId: 3, confidence: 1 });
  });

  it("limits concurrency", async () => {
    const library = createLibrary(() => new IDBFactory());
    await library.upsertFilms(
      Array.from({ length: 9 }, (_, i) => stored(`k${i}`, `Film ${i}`, 2000)),
    );
    let running = 0;
    let peak = 0;
    const search: SearchFn = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return [];
    };
    await resolveFilms(
      Array.from({ length: 9 }, (_, i) => `k${i}`),
      library,
      search,
      { concurrency: 2, sleep: noSleep },
    );
    expect(peak).toBe(2);
  });

  it("does not retry a rejected request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const library = await setup();
      await resolveFilms(["a"], library, fetchSearch(), { sleep: noSleep });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await find(library, "a"))?.confidence).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retries a busy proxy and reads the results", async () => {
    const answers = [
      new Response("{}", { status: 503 }),
      Response.json({ results: [movie(3, "Stalker", 1979)] }),
    ];
    const fetchMock = vi.fn<typeof fetch>(
      async () => answers.shift() ?? Response.json({ results: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const library = await setup();
      await resolveFilms(["a"], library, fetchSearch(), { sleep: noSleep });
      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/search?title=Stalker&year=1979");
      expect(await find(library, "a")).toMatchObject({ tmdbId: 3, confidence: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
