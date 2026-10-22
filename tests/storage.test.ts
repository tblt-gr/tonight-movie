import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLibrary, upgradeDatabase, type FilmInput } from "@/lib/storage/library";
import {
  DB_NAME,
  SETTINGS_KEY,
  filmKey,
  migrate,
  parseFilm,
  type StoredList,
} from "@/lib/storage/schema";
import { resetAll } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import {
  loadSettings,
  recordDraw,
  resetSettings,
  saveSettings,
  updateSettings,
} from "@/lib/storage/settings";
import { PERSISTENCE_NOTICE, clearUnavailable, getPersistenceNotice } from "@/lib/storage/status";

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

const film = (overrides: Partial<FilmInput> = {}): FilmInput => ({
  key: "https://boxd.it/abc",
  title: "Stalker",
  year: 1979,
  tmdbId: null,
  confidence: null,
  lists: ["watchlist"],
  seen: false,
  ...overrides,
});

let storage: MemoryStorage;
let factory: IDBFactory;

beforeEach(() => {
  storage = new MemoryStorage();
  factory = new IDBFactory();
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("indexedDB", factory);
  resetSettings();
  clearUnavailable();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("film key", () => {
  it("prefers the Letterboxd URI and falls back to title and year", () => {
    expect(filmKey({ letterboxdUri: " https://boxd.it/x ", title: "A", year: 2000 })).toBe(
      "https://boxd.it/x",
    );
    expect(filmKey({ title: " Stalker ", year: 1979 })).toBe("Stalker|1979");
    expect(filmKey({ letterboxdUri: "", title: "Stalker", year: null })).toBe("Stalker|");
  });
});

describe("settings", () => {
  it("survives a reload", () => {
    saveSettings({
      services: ["8"],
      sources: ["watchlist"],
      minDuration: null,
      maxDuration: 120,
      minRating: 7,
      minYear: 1990,
      maxYear: null,
      genres: ["Drame"],
      excludeSeen: false,
      recentDraws: [],
    });
    expect(loadSettings()).toMatchObject({
      services: ["8"],
      maxDuration: 120,
      minRating: 7,
      minYear: 1990,
      genres: ["Drame"],
      excludeSeen: false,
    });
  });

  it("loads settings saved before the fine filters existed", () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        data: { services: ["8"], sources: [], maxDuration: 90, excludeSeen: true, recentDraws: [] },
      }),
    );
    expect(loadSettings()).toMatchObject({
      services: ["8"],
      maxDuration: 90,
      minDuration: null,
      minRating: null,
      genres: [],
    });
  });

  it("keeps the last five distinct draws, newest first", () => {
    for (const key of ["a", "b", "c", "d", "e", "f", "c"]) recordDraw(key);
    expect(loadSettings().recentDraws).toEqual(["c", "f", "e", "d", "b"]);
  });

  it("falls back to memory and raises the notice when localStorage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
        removeItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
      },
    });
    expect(() => updateSettings({ maxDuration: 90 })).not.toThrow();
    expect(loadSettings().maxDuration).toBe(90);
    expect(getPersistenceNotice()).toBe(PERSISTENCE_NOTICE);
  });

  it("discards corrupted, malformed and newer-version values", () => {
    const stored = (value: string) => storage.setItem(SETTINGS_KEY, value);
    for (const value of [
      "{not json",
      "null",
      JSON.stringify({ version: 1, data: { services: "x" } }),
      JSON.stringify({
        version: 1,
        data: { services: [], sources: [], maxDuration: 99999, excludeSeen: true, recentDraws: [] },
      }),
      JSON.stringify({ version: 99, data: {} }),
    ]) {
      stored(value);
      expect(loadSettings()).toMatchObject({ services: [], maxDuration: null });
    }
  });
});

describe("migration", () => {
  const steps = {
    1: (data: unknown) => ({ ...(data as object), step1: true }),
    2: (data: unknown) => ({ ...(data as object), step2: true }),
  };

  it("runs every step from the stored version", () => {
    expect(migrate({}, 1, 3, steps)).toEqual({ step1: true, step2: true });
    expect(migrate({}, 2, 3, steps)).toEqual({ step2: true });
  });

  it("discards a newer, invalid or unreachable version", () => {
    expect(migrate({}, 4, 3, steps)).toBeNull();
    expect(migrate({}, "1", 3, steps)).toBeNull();
    expect(migrate({}, 0, 3, steps)).toBeNull();
    expect(migrate({}, 3, 5, steps)).toBeNull();
  });

  it("creates the stores when upgrading a fresh database", async () => {
    const request = factory.open("upgrade-test", 1);
    request.onupgradeneeded = (event) => upgradeDatabase(request.result, event.oldVersion, 1);
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    expect([...db.objectStoreNames].sort()).toEqual(["films", "lists"]);
    db.close();
  });

  it("keeps a database written by a newer build and runs in memory", async () => {
    const request = factory.open(DB_NAME, 7);
    await new Promise((resolve) => (request.onsuccess = resolve));
    request.result.close();
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film()]);
    expect(await lib.getFilms()).toHaveLength(1);
    expect(getPersistenceNotice()).toBe(PERSISTENCE_NOTICE);
    const check = factory.open(DB_NAME);
    await new Promise((resolve) => (check.onsuccess = resolve));
    expect(check.result.version).toBe(7);
    check.result.close();
  });
});

describe("library", () => {
  it("survives a reload", async () => {
    await createLibrary(() => factory).upsertFilms([film({ tmdbId: 42, confidence: 0.9 })]);
    const reloaded = await createLibrary(() => factory).getFilms();
    expect(reloaded).toEqual([
      {
        key: "https://boxd.it/abc",
        title: "Stalker",
        year: 1979,
        tmdbId: 42,
        confidence: 0.9,
        lists: ["watchlist"],
        seen: false,
      },
    ]);
  });

  it("leaves the store unchanged when the same films are upserted twice", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film(), film({ key: "Solaris|1972", title: "Solaris", year: 1972 })]);
    const first = await lib.getFilms();
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    await lib.upsertFilms([film(), film({ key: "Solaris|1972", title: "Solaris", year: 1972 })]);
    expect(put).not.toHaveBeenCalled();
    expect(await lib.getFilms()).toEqual(first);
    put.mockRestore();
  });

  it("keeps the resolved TMDB id and merges list memberships", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film({ tmdbId: 42, confidence: 1 })]);
    await lib.upsertFilms([film({ lists: ["favourites"], tmdbId: null, confidence: null })]);
    await lib.upsertFilms([film({ lists: ["watchlist"], tmdbId: 7, confidence: 0.5 })]);
    const [stored] = await lib.getFilms();
    expect(stored).toMatchObject({
      tmdbId: 42,
      confidence: 1,
      lists: ["watchlist", "favourites"],
    });
  });

  it("lets a new search replace a weak match", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film({ tmdbId: 7, confidence: 0.5 })]);
    await lib.upsertFilms([film({ tmdbId: 42, confidence: 1 })]);
    const [stored] = await lib.getFilms();
    expect(stored).toMatchObject({ tmdbId: 42, confidence: 1 });
  });

  it("never un-sees a film", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film({ seen: true })]);
    await lib.upsertFilms([film({ seen: false })]);
    expect((await lib.getFilms())[0].seen).toBe(true);
  });

  it("keeps an ignored entry ignored across a re-import until it is restored", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film()]);
    await lib.upsertFilms([film({ ignored: true })]);
    await lib.upsertFilms([film()]);
    expect((await lib.getFilms())[0].ignored).toBe(true);
    await lib.upsertFilms([film({ ignored: false })]);
    expect((await lib.getFilms())[0].ignored).toBeUndefined();
  });

  it("stores and updates list metadata idempotently", async () => {
    const lib = createLibrary(() => factory);
    const list: StoredList = { id: "watchlist", name: "Watchlist", importedAt: 1 };
    await lib.upsertList(list);
    await lib.upsertList(list);
    await lib.upsertList({ ...list, importedAt: 2 });
    expect(await lib.getLists()).toEqual([{ ...list, importedAt: 2 }]);
  });

  it("stores compact records only", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([{ ...film(), poster: "/p.jpg", overview: "long text" } as FilmInput]);
    const [stored] = await lib.getFilms();
    expect(Object.keys(stored).sort()).toEqual([
      "confidence",
      "key",
      "lists",
      "seen",
      "title",
      "tmdbId",
      "year",
    ]);
  });

  it("drops stored records that fail shape validation", async () => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("films", { keyPath: "key" });
      request.result.createObjectStore("lists", { keyPath: "id" });
    };
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const tx = db.transaction("films", "readwrite");
    tx.objectStore("films").put({
      key: "x",
      title: "<img src=x onerror=alert(1)>",
      year: "1999",
      lists: [],
      seen: false,
    });
    tx.objectStore("films").put(film());
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
    const films = await createLibrary(() => factory).getFilms();
    expect(films.map((stored) => stored.key)).toEqual(["https://boxd.it/abc"]);
    expect(parseFilm({ ...film(), tmdbId: -1 })).toBeNull();
  });

  it("works in memory when IndexedDB is missing", async () => {
    const lib = createLibrary(() => undefined);
    await expect(lib.upsertFilms([film()])).resolves.toBeUndefined();
    expect(await lib.getFilms()).toHaveLength(1);
    expect(getPersistenceNotice()).toBe(PERSISTENCE_NOTICE);
  });

  it("moves to memory and keeps the data when a write fails", async () => {
    const lib = createLibrary(() => factory);
    await lib.upsertFilms([film()]);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await expect(
      lib.upsertFilms([film({ key: "Solaris|1972", title: "Solaris", year: 1972 })]),
    ).resolves.toBeUndefined();
    put.mockRestore();
    expect((await lib.getFilms()).map((stored) => stored.title).sort()).toEqual([
      "Solaris",
      "Stalker",
    ]);
    expect(getPersistenceNotice()).toBe(PERSISTENCE_NOTICE);
  });
});

describe("reset", () => {
  it("removes every key and database the app created", async () => {
    saveSettings({ ...loadSettings(), services: ["8"] });
    await library.upsertFilms([film()]);
    await library.upsertList({ id: "watchlist", name: "Watchlist", importedAt: 1 });
    await resetAll();
    expect(storage.data.size).toBe(0);
    expect((await factory.databases()).map((db) => db.name)).not.toContain(DB_NAME);
    expect(await library.getFilms()).toEqual([]);
    expect(loadSettings().services).toEqual([]);
  });
});
