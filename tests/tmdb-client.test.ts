import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicCache, PUBLIC_CACHE_DB } from "@/lib/storage/public-cache";
import { createTmdbClient, DAY_MS, METADATA_TTL_MS } from "@/lib/tmdb-client";
import type { MovieDetails } from "@/lib/types";

const details = (id = 1): MovieDetails => ({
  tmdbId: id,
  title: `Film ${id}`,
  originalTitle: null,
  year: 2000,
  poster: "https://image.tmdb.org/t/p/w342/poster.jpg",
  rating: 7,
  overview: "Synopsis",
  runtime: 100,
  genres: ["Drame"],
  directors: [],
  cast: [],
  trailer: null,
  offers: [{ id: "8", name: "Netflix", icon: null, type: "FLATRATE", url: null }],
  offersUrl: null,
  availabilityStatus: "verified",
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const URL = "/api/movie/1";
const OFFERS_URL = "/api/movie/1/offers";
const emptyOffers = { offers: [], offersUrl: null, availabilityStatus: "unknown" };
let now: number;
let factory: IDBFactory;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let cache: ReturnType<typeof createPublicCache>;
let client: ReturnType<typeof createTmdbClient>;

beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  factory = new IDBFactory();
  cache = createPublicCache(() => factory);
  fetcher = vi.fn<typeof fetch>(async () => json(details()));
  client = createTmdbClient(fetcher, { sleep: async () => undefined }, cache);
});
afterEach(async () => {
  await client.clear();
  vi.restoreAllMocks();
});

describe("readFreshMovie", () => {
  it("answers from the cache only while the details and their offers need no request", async () => {
    expect(await client.readFreshMovie(URL)).toBeUndefined();
    await client.getMovie(URL);
    expect(await client.readFreshMovie(URL)).toEqual(details());
    const reloaded = createTmdbClient(
      fetcher,
      { sleep: async () => undefined },
      createPublicCache(() => factory),
    );
    expect(await reloaded.readFreshMovie(URL)).toEqual(details());
    now += DAY_MS + 1;
    expect(await reloaded.readFreshMovie(URL)).toBeUndefined();
  });
});

describe("persistent TMDB cache", () => {
  it("reuses a complete movie without another request, including after a reload", async () => {
    expect(await client.getMovie(URL)).toEqual(details());
    expect(await client.getMovie(URL)).toEqual(details());
    const reloaded = createTmdbClient(
      fetcher,
      {},
      createPublicCache(() => factory),
    );
    expect(await reloaded.getMovie(URL)).toEqual(details());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reloaded.peekMovie(URL)?.poster).toBe(details().poster);
  });

  it("refreshes only offers at 24 hours and keeps metadata for seven days", async () => {
    await client.getMovie(URL);
    now += DAY_MS;
    fetcher.mockResolvedValueOnce(json(emptyOffers));
    const updated = await client.getMovie(URL);
    expect(updated.poster).toBe(details().poster);
    expect(updated.availabilityStatus).toBe("unknown");
    expect(updated.offers).toEqual([]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([URL, OFFERS_URL]);
    expect(await client.getMovie(URL)).toEqual(updated);
    expect(client.peekMovie(URL)).toEqual(updated);
    expect(fetcher).toHaveBeenCalledTimes(2);
    now += METADATA_TTL_MS - DAY_MS;
    await client.getMovie(URL);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([URL, OFFERS_URL, URL]);
    expect((await cache.read(URL))?.at).toBe(now);
  });

  it("does not extend metadata freshness when offers are refreshed", async () => {
    await client.getMovie(URL);
    const savedAt = now;
    for (let day = 1; day < 7; day += 1) {
      now += DAY_MS;
      fetcher.mockResolvedValueOnce(json(emptyOffers));
      await client.getMovie(URL);
    }
    expect((await cache.read(URL))?.at).toBe(savedAt);
    expect(fetcher.mock.calls.filter(([url]) => url === URL)).toHaveLength(1);
  });

  it("never returns expired offers as verified after a refresh failure", async () => {
    await client.getMovie(URL);
    now += DAY_MS;
    expect(client.peekMovie(URL)).toBeUndefined();
    fetcher.mockResolvedValueOnce(json({}, 400));
    await expect(client.getMovie(URL)).rejects.toThrow("400");
    await expect(client.getMovie(URL)).rejects.toThrow("400");
    expect(fetcher).toHaveBeenCalledTimes(2);
    now += 60_000;
    fetcher.mockResolvedValueOnce(json(emptyOffers));
    expect((await client.getMovie(URL)).availabilityStatus).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("allows an explicit retry to bypass the failure cooldown", async () => {
    fetcher.mockResolvedValueOnce(json({}, 400));
    await expect(client.getMovie(URL)).rejects.toThrow();
    client.retryFailures();
    expect(await client.getMovie(URL)).toEqual(details());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps language and country caches separate", async () => {
    for (const suffix of ["", "?lang=en", "?region=BE", "?lang=en&region=BE"]) {
      await client.getMovie(URL + suffix);
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
    now += DAY_MS;
    fetcher.mockResolvedValueOnce(json(emptyOffers));
    await client.getMovie(URL + "?lang=en&region=BE");
    expect(fetcher.mock.lastCall?.[0]).toBe(OFFERS_URL + "?lang=en&region=BE");
  });

  it("does not use older standalone offers after a fresh full response", async () => {
    await cache.write({ key: OFFERS_URL, at: now - 1000, data: emptyOffers });
    expect((await client.getMovie(URL)).offers).toEqual(details().offers);
    expect(client.peekMovie(URL)?.offers).toEqual(details().offers);
  });

  it("ignores malformed and incompatible persisted movies", async () => {
    await cache.write({ key: URL, at: now, data: { ...details(), genres: "broken" } });
    expect(await client.getMovie(URL)).toEqual(details());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores entries with a future timestamp", async () => {
    await cache.write({ key: URL, at: now + DAY_MS, data: details() });
    await client.getMovie(URL);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("discards malformed persisted catalogue results", async () => {
    const url = "/api/discover?providers=8&page=1&sort=popularity";
    await cache.write({
      key: "/api/discover?page=1&providers=8&sort=popularity",
      at: now,
      data: { page: 1, totalPages: 1, results: [null] },
    });
    fetcher.mockResolvedValueOnce(json({ page: 1, totalPages: 1, results: [] }));
    await expect(client.get(url)).resolves.toMatchObject({ results: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps working when IndexedDB is unavailable or a write exceeds quota", async () => {
    const memory = createTmdbClient(
      fetcher,
      {},
      createPublicCache(() => undefined),
    );
    await memory.getMovie(URL);
    await memory.getMovie(URL);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await client.getMovie(URL);
    await client.getMovie(URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears persistent data and in-memory data together", async () => {
    await client.getMovie(URL);
    await client.clear();
    expect(client.peekMovie(URL)).toBeUndefined();
    expect((await factory.databases()).map((db) => db.name)).not.toContain(PUBLIC_CACHE_DB);
    await client.getMovie(URL);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("also caches catalogue pages and providers across visits until their TTL expires", async () => {
    const url = "/api/providers";
    fetcher.mockImplementation(async () => json({ providers: [] }));
    await client.get(url, METADATA_TTL_MS);
    const reloaded = createTmdbClient(
      fetcher,
      {},
      createPublicCache(() => factory),
    );
    await reloaded.get(url, METADATA_TTL_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += METADATA_TTL_MS;
    await reloaded.get(url, METADATA_TTL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("request coordination", () => {
  it("deduplicates concurrent movie and offers lookups", async () => {
    await Promise.all(Array.from({ length: 20 }, () => client.getMovie(URL)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += DAY_MS;
    fetcher.mockResolvedValueOnce(json(emptyOffers));
    await Promise.all(Array.from({ length: 20 }, () => client.getMovie(URL)));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares equivalent catalogue queries between browse and draw", async () => {
    fetcher.mockImplementation(async () => json({ page: 1, totalPages: 1, results: [] }));
    await client.get("/api/discover?providers=8,9&page=1");
    await client.get("/api/discover?page=1&sort=popularity&providers=9,8&lang=fr&region=FR");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not abort a request still needed by another consumer", async () => {
    let finish!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((resolve) => {
          expect(options?.signal?.aborted).toBe(false);
          finish = resolve;
          started();
        }),
    );
    const abort = new AbortController();
    const first = client.getMovie(URL, abort.signal);
    const second = client.getMovie(URL);
    await ready;
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    finish(json(details()));
    await expect(second).resolves.toEqual(details());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts abandoned work and does not cache its result", async () => {
    let finish!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const abort = new AbortController();
    const pending = client.getMovie(URL, abort.signal);
    await ready;
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    finish(json(details()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.peek(URL)).toBeUndefined();
  });

  it("limits network concurrency across different films", async () => {
    let active = 0;
    let peak = 0;
    fetcher.mockImplementation(async (url) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return json(details(Number(String(url).split("/").at(-1))));
    });
    await Promise.all(Array.from({ length: 20 }, (_, i) => client.getMovie(`/api/movie/${i + 1}`)));
    expect(peak).toBe(4);
  });

  it("does not repopulate the cache after reset during an in-flight request", async () => {
    let finish!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const pending = client.getMovie(URL);
    await ready;
    await client.clear();
    finish(json(details()));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.peek(URL)).toBeUndefined();
  });
});
