import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { confirmMatch, findCandidates } from "@/lib/review";
import { createLibrary } from "@/lib/storage/library";
import type { MovieSummary } from "@/lib/types";

const movie = (tmdbId: number, title: string, year: number | null): MovieSummary => ({
  tmdbId,
  title,
  originalTitle: null,
  year,
  poster: null,
  rating: null,
});

describe("findCandidates", () => {
  it("finds a film whose year is wrong, because the year does not filter the search", async () => {
    const search = vi.fn(async () => [
      movie(1, "Kill Bill : Volume 1", 2003),
      movie(2, "Kill Bill: The Whole Bloody Affair", 2026),
      movie(3, "Bill", 2015),
    ]);
    const found = await findCandidates(
      { title: "Kill Bill: The Whole Bloody Affair", year: 2004 },
      search,
    );
    expect(found[0].tmdbId).toBe(2);
    expect(found.map(({ tmdbId }) => tmdbId)).toContain(1);
    expect(search).toHaveBeenCalledWith("Kill Bill: The Whole Bloody Affair", null);
  });

  it("also searches the title without its subtitle and merges the answers", async () => {
    const search = vi.fn(async (title: string) =>
      title === "Kill Bill" ? [movie(1, "Kill Bill : Volume 1", 2003)] : [],
    );
    const found = await findCandidates({ title: "Kill Bill: Vol. 1", year: 2003 }, search);
    expect(search).toHaveBeenCalledWith("Kill Bill", null);
    expect(found.map(({ tmdbId }) => tmdbId)).toEqual([1]);
  });

  it("keeps the closest films first, without duplicates, up to the limit", async () => {
    const search = vi.fn(async () => [
      movie(1, "Heat", 1995),
      movie(2, "Heat", 1986),
      movie(1, "Heat", 1995),
      movie(3, "Heat Wave", 1996),
      movie(4, "Heat Vision and Jack", 1999),
      movie(5, "Unrelated", 1995),
    ]);
    const found = await findCandidates({ title: "Heat", year: 1995 }, search, 3);
    expect(found.map(({ tmdbId }) => tmdbId)).toEqual([1, 2, 3]);
  });

  it("proposes nothing when no title is alike", async () => {
    const found = await findCandidates({ title: "Heat", year: null }, async () => [
      movie(5, "Unrelated", 1995),
    ]);
    expect(found).toEqual([]);
  });
});

describe("confirmMatch", () => {
  const unsure = {
    key: "a",
    title: "Kill Bill: The Whole Bloody Affair",
    year: 2004,
    tmdbId: 1,
    confidence: 0.5,
    lists: ["watchlist"],
    seen: false,
    facts: { runtime: 111, rating: 7, year: 2003 },
  };

  it("makes the chosen film a sure match, drops the old facts and reads the new ones", async () => {
    const store = createLibrary(() => new IDBFactory());
    await store.upsertFilms([unsure]);
    const facts = { runtime: 247, rating: 8, year: 2026 };
    await confirmMatch(store, unsure, 2, { fetchFacts: async () => facts });
    expect((await store.getFilms())[0]).toMatchObject({ tmdbId: 2, confidence: 1, facts });
  });

  it("keeps the match even when the facts cannot be read", async () => {
    const store = createLibrary(() => new IDBFactory());
    await store.upsertFilms([unsure]);
    await confirmMatch(store, unsure, 2, {
      fetchFacts: async () => {
        throw new Error("down");
      },
    });
    const [film] = await store.getFilms();
    expect(film).toMatchObject({ tmdbId: 2, confidence: 1 });
    expect(film.facts).toBeUndefined();
  });
});
