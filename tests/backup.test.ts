import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BackupError, createBackup, parseBackup } from "@/lib/storage/backup";
import { createLibrary } from "@/lib/storage/library";
import { DEFAULT_SETTINGS, type StoredFilm, type StoredList } from "@/lib/storage/schema";

const film = (key: string, patch: Partial<StoredFilm> = {}): StoredFilm => ({
  key,
  title: key,
  year: 2000,
  tmdbId: 7,
  confidence: 1,
  lists: ["watchlist"],
  seen: false,
  facts: { runtime: 100, rating: 7, year: 2000 },
  ...patch,
});
const list: StoredList = { id: "watchlist", name: "Watchlist", importedAt: 5 };
const settings = { ...DEFAULT_SETTINGS, services: ["8"], sources: ["watchlist"], region: "FR" };

const codeOf = (text: string) => {
  try {
    parseBackup(text);
  } catch (error) {
    return error instanceof BackupError ? error.code : "other";
  }
  return "none";
};

describe("parseBackup", () => {
  it("reads back what createBackup wrote", () => {
    const backup = createBackup(settings, [film("a"), film("b", { ignored: true })], [list], 42);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it("refuses text that is not JSON, not a backup, or from a newer app", () => {
    expect(codeOf("{nope")).toBe("unreadable");
    expect(codeOf("[]")).toBe("unrecognized");
    expect(codeOf(JSON.stringify({ app: "other", version: 1 }))).toBe("unrecognized");
    const newer = { ...createBackup(settings, [], []), version: 99 };
    expect(codeOf(JSON.stringify(newer))).toBe("newer");
  });

  it("refuses the whole file when one record is invalid", () => {
    const backup = createBackup(settings, [film("a")], [list]);
    expect(codeOf(JSON.stringify({ ...backup, films: [film("a"), { key: "b" }] }))).toBe("invalid");
    expect(codeOf(JSON.stringify({ ...backup, lists: [{ id: "x" }] }))).toBe("invalid");
    expect(codeOf(JSON.stringify({ ...backup, settings: { services: 3 } }))).toBe("invalid");
    expect(codeOf(JSON.stringify({ ...backup, films: "no" }))).toBe("invalid");
  });

  it("keeps one record per key", () => {
    const backup = createBackup(settings, [film("a"), film("a", { seen: true })], [list]);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.films).toHaveLength(1);
    expect(parsed.films[0].seen).toBe(true);
  });
});

describe("library.replaceAll", () => {
  it("leaves exactly the given records", async () => {
    const store = createLibrary(() => new IDBFactory());
    await store.upsertFilms([film("old")]);
    await store.upsertList({ id: "liked", name: "Liked", importedAt: 1 });
    await store.replaceAll([film("a"), film("b")], [list]);
    expect((await store.getFilms()).map((f) => f.key).sort()).toEqual(["a", "b"]);
    expect(await store.getLists()).toEqual([list]);
  });
});
