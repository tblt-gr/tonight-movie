import { describe, expect, it, vi } from "vitest";
import { enrichFilms } from "@/lib/enrich";
import type { FilmInput } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";

const stored = (key: string, patch: Partial<StoredFilm> = {}): StoredFilm => ({
  key,
  title: key,
  year: 2000,
  tmdbId: Number(key.replace(/\D/g, "")) || null,
  confidence: 1,
  lists: ["l"],
  seen: false,
  ...patch,
});

function memoryStore(films: StoredFilm[]) {
  const map = new Map(films.map((film) => [film.key, film]));
  return {
    map,
    getFilms: async () => [...map.values()],
    upsertFilms: async (inputs: FilmInput[]) => {
      for (const input of inputs) {
        map.set(input.key, { ...map.get(input.key)!, ...input, lists: map.get(input.key)!.lists });
      }
    },
  };
}

const FACTS = { runtime: 100, rating: 7, year: 2000 };

describe("enrichFilms", () => {
  it("stores the facts of matched films that have none", async () => {
    const store = memoryStore([
      stored("f1"),
      stored("f2", { facts: FACTS }),
      stored("f3", { confidence: 0.5 }),
      stored("f4", { tmdbId: null }),
    ]);
    const fetchFacts = vi.fn(async () => FACTS);
    await enrichFilms(["f1", "f2", "f3", "f4"], store, fetchFacts, { intervalMs: 0 });
    expect(fetchFacts).toHaveBeenCalledTimes(1);
    expect(store.map.get("f1")?.facts).toEqual(FACTS);
  });

  it("also looks up a film that has facts when its details are not at hand", async () => {
    const store = memoryStore([
      stored("f1", { facts: FACTS }),
      stored("f2", { facts: FACTS }),
      stored("f3"),
    ]);
    const fetchFacts = vi.fn<(id: number) => Promise<typeof FACTS>>(async () => ({
      runtime: 1,
      rating: 1,
      year: 1,
    }));
    const isWarm = vi.fn(async (id: number) => id === 2);
    await enrichFilms(["f1", "f2", "f3"], store, fetchFacts, { intervalMs: 0, isWarm });
    expect(fetchFacts.mock.calls.map(([id]) => id).sort()).toEqual([1, 3]);
    expect(store.map.get("f1")?.facts).toEqual(FACTS);
    expect(store.map.get("f3")?.facts).toEqual({ runtime: 1, rating: 1, year: 1 });
  });

  it("leaves a film without facts when its lookup fails, so a later call retries", async () => {
    const store = memoryStore([stored("f1"), stored("f2")]);
    const fetchFacts = vi.fn(async (id: number) => {
      if (id === 1) throw new Error("down");
      return FACTS;
    });
    const progress = vi.fn();
    await enrichFilms(["f1", "f2"], store, fetchFacts, { intervalMs: 0, onProgress: progress });
    expect(store.map.get("f1")?.facts).toBeUndefined();
    expect(store.map.get("f2")?.facts).toEqual(FACTS);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("spaces the lookups under the server rate limit", async () => {
    const store = memoryStore(Array.from({ length: 5 }, (_, i) => stored(`f${i + 1}`)));
    const starts: number[] = [];
    const started = Date.now();
    await enrichFilms(
      store.map.size ? [...store.map.keys()] : [],
      store,
      async () => {
        starts.push(Date.now() - started);
        return FACTS;
      },
      { intervalMs: 40 },
    );
    expect(starts).toHaveLength(5);
    expect(starts[4] - starts[0]).toBeGreaterThanOrEqual(140);
  });

  it("saves the facts in groups and keeps what was read when aborted", async () => {
    const store = memoryStore(Array.from({ length: 60 }, (_, i) => stored(`f${i + 1}`)));
    const upsert = vi.spyOn(store, "upsertFilms");
    await enrichFilms([...store.map.keys()], store, async () => FACTS, { intervalMs: 0 });
    expect(upsert.mock.calls.length).toBeLessThanOrEqual(4);
    expect([...store.map.values()].every((film) => film.facts)).toBe(true);

    const other = memoryStore(Array.from({ length: 10 }, (_, i) => stored(`g${i + 1}`)));
    const controller = new AbortController();
    await enrichFilms(
      [...other.map.keys()],
      other,
      async (id) => {
        if (id === 4) controller.abort();
        return FACTS;
      },
      { intervalMs: 0, signal: controller.signal },
    );
    expect([...other.map.values()].filter((film) => film.facts).length).toBeGreaterThan(0);
  });

  it("stops when aborted", async () => {
    const store = memoryStore([stored("f1"), stored("f2")]);
    const controller = new AbortController();
    controller.abort();
    const fetchFacts = vi.fn(async () => FACTS);
    await enrichFilms(["f1", "f2"], store, fetchFacts, { signal: controller.signal });
    expect(fetchFacts).not.toHaveBeenCalled();
  });
});
