import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createLibrary, type FilmInput } from "@/lib/storage/library";

const stalker: FilmInput = {
  key: "https://boxd.it/abc",
  title: "Stalker",
  year: 1979,
  tmdbId: 1398,
  confidence: 1,
  lists: ["watchlist"],
  seen: false,
};

const newLibrary = () => createLibrary(() => new IDBFactory());

describe("library.setSeen", () => {
  it("stores a film the visitor never imported, with no list", async () => {
    const store = newLibrary();
    await store.setSeen({ tmdbId: 603, title: "The Matrix", year: 1999 }, true);
    expect(await store.getFilms()).toEqual([
      {
        key: "The Matrix|1999",
        title: "The Matrix",
        year: 1999,
        tmdbId: 603,
        confidence: 1,
        lists: [],
        seen: true,
      },
    ]);
  });

  it("marks a stored film as seen and keeps its lists", async () => {
    const store = newLibrary();
    await store.upsertFilms([stalker]);
    await store.setSeen({ key: stalker.key, tmdbId: null, title: "Stalker", year: null }, true);
    const films = await store.getFilms();
    expect(films).toHaveLength(1);
    expect(films[0]).toMatchObject({ seen: true, lists: ["watchlist"] });
  });

  it("finds a stored film by TMDB id when the title differs", async () => {
    const store = newLibrary();
    await store.upsertFilms([stalker]);
    await store.setSeen({ tmdbId: 1398, title: "Сталкер", year: 1979 }, true);
    expect(await store.getFilms()).toHaveLength(1);
    expect((await store.getFilms())[0].seen).toBe(true);
  });

  it("finds a stored film by normalized title and year", async () => {
    const store = newLibrary();
    await store.upsertFilms([{ ...stalker, tmdbId: null, confidence: null }]);
    await store.setSeen({ tmdbId: 1398, title: "stalker", year: 1979 }, true);
    expect(await store.getFilms()).toHaveLength(1);
    expect((await store.getFilms())[0].seen).toBe(true);
  });

  it("clears seen on every matching record and keeps their lists", async () => {
    const store = newLibrary();
    await store.upsertFilms([
      { ...stalker, seen: true },
      { ...stalker, key: "Stalker|1979", lists: [], seen: true },
    ]);
    await store.setSeen({ tmdbId: 1398, title: "Stalker", year: 1979 }, false);
    const films = await store.getFilms();
    expect(films.map((film) => film.seen)).toEqual([false]);
    expect(films[0].lists).toEqual(["watchlist"]);
  });

  it("forgets a manual entry once it is no longer seen", async () => {
    const store = newLibrary();
    await store.setSeen({ tmdbId: 603, title: "The Matrix", year: 1999 }, true);
    await store.setSeen({ tmdbId: 603, title: "The Matrix", year: 1999 }, false);
    expect(await store.getFilms()).toEqual([]);
  });

  it("stays seen after an import that carries no diary data", async () => {
    const store = newLibrary();
    await store.upsertFilms([stalker]);
    await store.setSeen({ key: stalker.key, tmdbId: 1398, title: "Stalker", year: 1979 }, true);
    await store.upsertFilms([{ ...stalker, seen: false }]);
    expect((await store.getFilms())[0].seen).toBe(true);
  });
});
