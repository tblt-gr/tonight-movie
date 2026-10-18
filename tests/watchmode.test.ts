import { afterEach, describe, expect, it, vi } from "vitest";
import { getWatchLinks, mapWatchLinks } from "@/lib/watchmode";

describe("mapWatchLinks", () => {
  it("matches links to TMDB providers by host and prefers streaming over rent", () => {
    expect(
      mapWatchLinks([
        { type: "rent", web_url: "https://www.netflix.com/title/1" },
        { type: "sub", web_url: "https://www.netflix.com/title/2" },
        { type: "sub", web_url: "https://app.primevideo.com/detail?gti=abc" },
      ]),
    ).toEqual({
      "8": "https://www.netflix.com/title/2",
      "1796": "https://www.netflix.com/title/2",
      "119": "https://app.primevideo.com/detail?gti=abc",
    });
  });

  it("ignores unknown hosts, insecure and invalid links", () => {
    expect(
      mapWatchLinks([
        { type: "sub", web_url: "https://unknown.example/x" },
        { type: "sub", web_url: "http://www.netflix.com/title/1" },
        { type: "sub", web_url: "javascript:alert(1)" },
        { type: "sub", web_url: null },
        { type: "sub", web_url: "https://evilnetflix.com/x" },
      ]),
    ).toEqual({});
  });
});

describe("getWatchLinks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is null without a key and never calls Watchmode", async () => {
    vi.stubEnv("WATCHMODE_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getWatchLinks(1)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null when the quota is exhausted", async () => {
    vi.stubEnv("WATCHMODE_API_KEY", "key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    expect(await getWatchLinks(1)).toBeNull();
  });

  it("is empty, not null, for a film Watchmode does not know", async () => {
    vi.stubEnv("WATCHMODE_API_KEY", "key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    expect(await getWatchLinks(1)).toEqual({});
  });

  it("asks for the French sources of the TMDB movie", async () => {
    vi.stubEnv("WATCHMODE_API_KEY", "key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json([{ type: "sub", web_url: "https://www.netflix.com/title/9" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect((await getWatchLinks(479924))?.["8"]).toBe("https://www.netflix.com/title/9");
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/title/movie-479924/sources/");
    expect(url.searchParams.get("regions")).toBe("FR");
  });
});
