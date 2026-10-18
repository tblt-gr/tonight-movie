import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeImportError,
  importExport,
  matchStats,
  planImport,
  summarizeImport,
} from "@/lib/import/apply";
import { ImportError, type ImportResult } from "@/lib/import/letterboxd";
import { getDictionary } from "@/lib/i18n";
import { createLibrary } from "@/lib/storage/library";

const result: ImportResult = {
  lists: ["Horror night"],
  films: [
    { key: "a", title: "Stalker", year: 1979, uri: null, memberships: ["watchlist", "liked"] },
    { key: "b", title: "Heat", year: 1995, uri: null, memberships: ["list:Horror night", "seen"] },
    { key: "c", title: "Nope", year: 2022, uri: null, memberships: ["seen"] },
  ],
};

const asStored = (films: ReturnType<typeof planImport>["films"]) =>
  films.map((film) => ({ ...film, lists: film.lists ?? [] }));

describe("summarizeImport", () => {
  it("counts the films of each source", () => {
    expect(summarizeImport(result)).toEqual({
      watchlist: 1,
      lists: 1,
      liked: 1,
      seen: 2,
      total: 3,
    });
  });
});

describe("matchStats", () => {
  const film = (key: string, tmdbId: number | null, confidence: number | null) => ({
    key,
    title: key,
    year: null,
    tmdbId,
    confidence,
    lists: [],
    seen: false,
  });

  it("splits imported films into drawable and to check, ignoring other films", () => {
    const films = [film("a", 1, 1), film("b", 2, 0.5), film("c", null, null), film("z", 9, 1)];
    expect(matchStats(films, new Set(["a", "b", "c"]))).toEqual({ drawable: 1, toCheck: 2 });
  });
});

describe("describeImportError", () => {
  it("words an import error in the language of the page", () => {
    const error = new ImportError("empty", "internal message");
    expect(describeImportError(error, getDictionary("fr"))).toBe("Ce fichier est vide.");
    expect(describeImportError(error, getDictionary("en"))).toBe("This file is empty.");
  });

  it("hides the details of an unexpected error", () => {
    expect(describeImportError(new TypeError("boom"), getDictionary("fr"))).toBe(
      "L’import a échoué. Réessayez avec un autre fichier.",
    );
    expect(describeImportError(new TypeError("boom"), getDictionary("en"))).toBe(
      "The import failed. Try again with another file.",
    );
  });
});

describe("planImport", () => {
  it("maps memberships to list ids and the seen flag", () => {
    const plan = planImport(result, [], [], 100);
    expect(plan.films.map(({ key, lists, seen }) => ({ key, lists, seen }))).toEqual([
      { key: "a", lists: ["watchlist", "liked"], seen: false },
      { key: "b", lists: ["list:Horror night"], seen: true },
      { key: "c", lists: [], seen: true },
    ]);
    expect(plan.lists).toEqual([
      { id: "watchlist", name: "Watchlist", importedAt: 100 },
      { id: "liked", name: "Films aimés", importedAt: 100 },
      { id: "list:Horror night", name: "Horror night", importedAt: 100 },
    ]);
  });

  it("plans no list record when the same file comes again", () => {
    const first = planImport(result, [], [], 100);
    expect(planImport(result, asStored(first.films), first.lists, 200).lists).toEqual([]);
  });

  it("refreshes only the list that received a new film", () => {
    const first = planImport(result, [], [], 100);
    const newer: ImportResult = {
      ...result,
      films: [
        ...result.films,
        { key: "d", title: "Alien", year: 1979, uri: null, memberships: ["watchlist"] },
      ],
    };
    expect(planImport(newer, asStored(first.films), first.lists, 200).lists).toEqual([
      { id: "watchlist", name: "Watchlist", importedAt: 200 },
    ]);
  });

  it("keeps a list that has no film rows", () => {
    const empty: ImportResult = { films: [], lists: ["Vide"] };
    expect(planImport(empty, [], [], 1).lists).toEqual([
      { id: "list:Vide", name: "Vide", importedAt: 1 },
    ]);
  });
});

describe("importExport", () => {
  afterEach(() => vi.unstubAllGlobals());

  const csv = (name: string, body: string) => new File([body], name, { type: "text/csv" });
  const watchlist = "Date,Name,Year,Letterboxd URI\n2024-01-01,Stalker,1979,https://boxd.it/a\n";

  const stubSearch = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              tmdbId: 3,
              title: "Stalker",
              originalTitle: null,
              year: 1979,
              poster: null,
              rating: null,
            },
          ],
        }),
      ),
    );

  it("stores, matches and reports the films", async () => {
    stubSearch();
    const store = createLibrary(() => new IDBFactory());
    const progress = vi.fn();
    const outcome = await importExport(csv("watchlist.csv", watchlist), store, {
      onProgress: progress,
    });
    expect(outcome.summary).toMatchObject({ watchlist: 1, total: 1 });
    expect(outcome.stats).toEqual({ drawable: 1, toCheck: 0 });
    expect(progress).toHaveBeenCalledWith({ phase: "matching", done: 1, total: 1 });
    expect(await store.getLists()).toHaveLength(1);
  });

  it("leaves stored data unchanged when the same file is imported twice", async () => {
    stubSearch();
    const store = createLibrary(() => new IDBFactory());
    await importExport(csv("watchlist.csv", watchlist), store);
    const films = await store.getFilms();
    const lists = await store.getLists();
    const second = await importExport(csv("watchlist.csv", watchlist), store, {
      now: () => Date.now() + 60_000,
    });
    expect(await store.getFilms()).toEqual(films);
    expect(await store.getLists()).toEqual(lists);
    expect(second.summary.total).toBe(1);
  });

  it.each([
    ["an empty file", csv("watchlist.csv", ""), "empty", 1000],
    ["a wrong type", csv("photo.png", "x"), "unrecognized", 1000],
    ["unrelated content", csv("other.csv", "a,b\n1,2\n"), "unrecognized", 1000],
    ["an oversized file", csv("watchlist.csv", watchlist), "too_large", 5],
  ])("refuses %s and writes nothing", async (_label, file, code, maxFileBytes) => {
    stubSearch();
    const store = createLibrary(() => new IDBFactory());
    await expect(importExport(file, store, { limits: { maxFileBytes } })).rejects.toMatchObject({
      code,
    });
    expect(await store.getFilms()).toEqual([]);
    expect(await store.getLists()).toEqual([]);
  });
});
