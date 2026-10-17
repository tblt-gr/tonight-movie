import { describe, expect, it, vi } from "vitest";
import { collectSwapPosters, createDrawClient } from "@/lib/draw-client";
import type { DrawInput } from "@/lib/draw";
import { DEFAULT_SETTINGS, type StoredFilm } from "@/lib/storage/schema";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const asFetch = (fn: (url: string) => Promise<Response>) => fn as unknown as typeof fetch;

describe("createDrawClient", () => {
  it("calls the app's own routes", async () => {
    const fetcher = vi.fn((url: string) =>
      url.startsWith("/api/discover")
        ? json({ page: 2, totalPages: 3, results: [] })
        : json({ results: [] }),
    );
    const { deps } = createDrawClient(asFetch(fetcher));
    await deps.discover([8, 9], 120, 2);
    await deps.search("Alien", 1979);
    expect(fetcher.mock.calls[0][0]).toBe("/api/discover?providers=8%2C9&maxRuntime=120&page=2");
    expect(fetcher.mock.calls[1][0]).toBe("/api/search?title=Alien&year=1979");
  });

  it("tells an outage from a draw that found nothing", async () => {
    const down = createDrawClient(asFetch(() => json({}, 500)));
    await expect(down.deps.getDetails(1)).rejects.toThrow();
    expect(down.isOutage()).toBe(true);

    const up = createDrawClient(asFetch(() => json({ results: [] })));
    await up.deps.search("x", null);
    expect(up.isOutage()).toBe(false);
  });

  it("waits out a 429 and retries, honoring Retry-After", async () => {
    let calls = 0;
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    const fetcher = vi.fn(() => {
      calls += 1;
      return calls < 3
        ? Promise.resolve(new Response("{}", { status: 429, headers: { "Retry-After": "4" } }))
        : json({ tmdbId: 1 });
    });
    const client = createDrawClient(asFetch(fetcher), { sleep });
    await expect(client.deps.getDetails(1)).resolves.toMatchObject({ tmdbId: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 4000);
    expect(client.isOutage()).toBe(false);
  });

  it("gives up on a 429 that never clears", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    const fetcher = vi.fn(() => json({}, 429));
    const client = createDrawClient(asFetch(fetcher), { sleep });
    await expect(client.deps.getDetails(1)).rejects.toThrow("429");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("is not an outage before any call", () => {
    expect(createDrawClient(asFetch(() => json({}))).isOutage()).toBe(false);
  });
});

describe("collectSwapPosters", () => {
  const stored = (tmdbId: number): StoredFilm => ({
    key: `k${tmdbId}`,
    title: `F${tmdbId}`,
    year: 2000,
    tmdbId,
    confidence: 1,
    lists: ["watchlist"],
    seen: false,
  });
  const base = (sources: string[], films: StoredFilm[]): DrawInput => ({
    settings: { ...DEFAULT_SETTINGS, services: ["8"], sources },
    films,
    lists: [{ id: "watchlist" }],
  });

  it("uses posters of the list's own films", async () => {
    const getDetails = vi.fn(async (id: number) => ({ poster: id === 2 ? null : `/p${id}.jpg` }));
    const discover = vi.fn();
    const posters = await collectSwapPosters(
      base(["watchlist"], [stored(1), stored(2), stored(3)]),
      { getDetails, discover } as never,
      () => 0.3,
    );
    expect(posters.sort()).toEqual(["/p1.jpg", "/p3.jpg"]);
    expect(discover).not.toHaveBeenCalled();
  });

  it("uses popular films on the services for a global draw", async () => {
    const discover = vi.fn(async () => ({
      page: 1,
      totalPages: 1,
      results: [{ poster: "/a.jpg" }, { poster: null }, { poster: "/b.jpg" }],
    }));
    const posters = await collectSwapPosters(
      base(["services"], []),
      { getDetails: vi.fn(), discover } as never,
      () => 0,
    );
    expect(posters).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("returns nothing rather than failing", async () => {
    const posters = await collectSwapPosters(
      base(["services"], []),
      {
        getDetails: vi.fn(),
        discover: vi.fn(async () => {
          throw new Error("down");
        }),
      } as never,
      () => 0,
    );
    expect(posters).toEqual([]);
  });
});
