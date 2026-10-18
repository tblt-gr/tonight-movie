import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as discover } from "@/app/api/discover/route";
import { GET as health } from "@/app/api/health/route";
import { GET as movie } from "@/app/api/movie/[id]/route";
import { GET as providers } from "@/app/api/providers/route";
import { GET as search } from "@/app/api/search/route";
import { checkRateLimit, clientKey, resetRateLimit } from "@/lib/rate-limit";
import { imageUrl, mapMovie, mapOffers } from "@/lib/tmdb";

const KEY = "header.payload.signature-do-not-leak";
const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

const req = (path: string, ip = "1.1.1.1") =>
  new Request(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });

const movieParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TMDB_API_KEY", KEY);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fetchMock.mockReset();
  resetRateLimit();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validation", () => {
  it.each([
    ["/api/search"],
    ["/api/search?title="],
    ["/api/search?title=a&year=abc"],
    ["/api/search?title=a&year=1700"],
    ["/api/search?title=a&extra=1"],
    ["/api/search?title=a&title=b"],
    [`/api/search?title=${"a".repeat(101)}`],
  ])("rejects %s with 400 and never calls TMDB", async (path) => {
    const response = await search(req(path));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("bad_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/discover"],
    ["/api/discover?providers=abc"],
    ["/api/discover?providers=8,-1"],
    ["/api/discover?providers=8&page=501"],
    ["/api/discover?providers=8&page=0"],
    ["/api/discover?providers=8&maxRuntime=0"],
    ["/api/discover?providers=8&maxRuntime=601"],
    ["/api/discover?providers=8,"],
    ["/api/discover?providers=8&maxRuntime=1e3"],
    ["/api/discover?providers=8&minRating=11"],
    ["/api/discover?providers=8&minRating=7.3"],
    ["/api/discover?providers=8&genres=abc"],
    ["/api/discover?providers=8&minYear=1700"],
    ["/api/discover?providers=8&sort=revenue"],
    ["/api/discover?providers=8&sort=rating&sort=year"],
    [`/api/discover?providers=${Array.from({ length: 21 }, (_, i) => i + 1).join(",")}`],
  ])("rejects %s with 400", async (path) => {
    expect((await discover(req(path))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed movie id", async () => {
    for (const id of ["abc", "0", "1.5", "../3/account", "1234567890"]) {
      expect((await movie(req("/api/movie/x"), movieParams(id))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects parameters on routes that take none", async () => {
    expect((await providers(req("/api/providers?x=1"))).status).toBe(400);
  });
});

describe("offer mapping", () => {
  it("maps TMDB offer kinds and keeps Prime channels as separate ids", () => {
    const offers = mapOffers({
      flatrate: [
        { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/prime.jpg" },
        { provider_id: 1899, provider_name: "Max Amazon Channel", logo_path: null },
      ],
      free: [{ provider_id: 531, provider_name: "Paramount+" }],
      ads: [{ provider_id: 2, provider_name: "Pub TV" }],
      rent: [{ provider_id: 2, provider_name: "Apple TV" }],
      buy: [{ provider_id: 3, provider_name: "Google Play" }],
    });
    expect(offers.map((o) => [o.id, o.type])).toEqual([
      ["119", "FLATRATE"],
      ["1899", "FLATRATE"],
      ["531", "FREE"],
      ["2", "ADS"],
      ["2", "RENT"],
      ["3", "BUY"],
    ]);
    expect(offers[0].icon).toBe("https://image.tmdb.org/t/p/w92/prime.jpg");
    expect(offers[1].icon).toBeNull();
  });

  it("flags a film with no French data as unknown, not unavailable", () => {
    const base = { id: 1, title: "Film", release_date: "2020-05-01" };
    expect(mapMovie(base)?.availabilityStatus).toBe("unknown");
    expect(
      mapMovie({ ...base, "watch/providers": { results: { US: { flatrate: [] } } } })
        ?.availabilityStatus,
    ).toBe("unknown");
    expect(
      mapMovie({ ...base, "watch/providers": { results: { FR: { link: "x", flatrate: [] } } } })
        ?.availabilityStatus,
    ).toBe("unknown");
  });

  it("drops entries without an id or a name", () => {
    expect(mapOffers({ flatrate: [{ provider_name: "x" }, { provider_id: 1 }] })).toEqual([]);
  });

  it("builds image URLs in one place and refuses odd paths", () => {
    expect(imageUrl("/a.jpg", "poster")).toBe("https://image.tmdb.org/t/p/w342/a.jpg");
    expect(imageUrl("//evil.example/x.jpg", "poster")).toBeNull();
    expect(imageUrl(null, "logo")).toBeNull();
  });
});

describe("routes", () => {
  it("returns French film details with offers", async () => {
    reply({
      id: 603,
      title: "Matrix",
      release_date: "1999-03-30",
      poster_path: "/m.jpg",
      vote_average: 8.2,
      vote_count: 100,
      runtime: 136,
      overview: " Un hacker. ",
      genres: [{ name: "Science-Fiction" }],
      "watch/providers": {
        results: {
          FR: {
            link: "https://www.themoviedb.org/movie/603/watch?locale=FR",
            flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
          },
        },
      },
    });
    const response = await movie(req("/api/movie/603"), movieParams("603"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      tmdbId: 603,
      year: 1999,
      runtime: 136,
      availabilityStatus: "verified",
      offers: [{ id: "8", type: "FLATRATE" }],
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://api.themoviedb.org");
    expect(url.pathname).toBe("/3/movie/603");
    expect(url.searchParams.get("language")).toBe("fr-FR");
    expect(url.searchParams.get("append_to_response")).toBe("watch/providers");
  });

  it("asks TMDB for English text on request and keeps genres under their stored name", async () => {
    reply({
      id: 603,
      title: "The Matrix",
      release_date: "1999-03-30",
      genres: [
        { id: 878, name: "Science Fiction" },
        { id: 35, name: "Comedy" },
        { id: 99999, name: "Brand New Genre" },
      ],
    });
    const response = await movie(req("/api/movie/603?lang=en"), movieParams("603"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("language")).toBe("en-US");
    // The stored name is the French one, so settings and URLs keep working in either language.
    expect(body.genres).toEqual(["Science-Fiction", "Comédie", "Brand New Genre"]);
  });

  it.each([
    ["/api/movie/603?lang=de"],
    ["/api/providers?lang="],
    ["/api/discover?providers=8&lang=xx"],
  ])("rejects an unsupported language: %s", async (path) => {
    const handler = path.startsWith("/api/movie")
      ? (request: Request) => movie(request, movieParams("603"))
      : path.startsWith("/api/providers")
        ? providers
        : discover;
    expect((await handler(req(path))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the language to the provider list and to discover", async () => {
    reply({ results: [] });
    await providers(req("/api/providers?lang=en"));
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("language")).toBe("en-US");
    reply({ page: 1, total_pages: 1, results: [] });
    await discover(req("/api/discover?providers=8&lang=en"));
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("language")).toBe("en-US");
  });

  it("searches in French and English and keeps the English title", async () => {
    reply({ results: [{ id: 1, title: "Le Salaire de la peur", release_date: "1953-04-22" }] });
    reply({
      results: [
        { id: 1, title: "The Wages of Fear", release_date: "1953-04-22" },
        { id: 2, title: "Only English", release_date: "1953-01-01" },
      ],
    });
    const body = await (await search(req("/api/search?title=The%20Wages%20of%20Fear"))).json();
    expect(body.results).toMatchObject([
      { tmdbId: 1, title: "Le Salaire de la peur", englishTitle: "The Wages of Fear" },
      { tmdbId: 2, title: "Only English", englishTitle: "Only English" },
    ]);
    const languages = fetchMock.mock.calls.map(([url]) =>
      new URL(url).searchParams.get("language"),
    );
    expect(languages).toEqual(["fr-FR", "en-US"]);
  });

  it("searches with the title and year", async () => {
    reply({ results: [{ id: 1, title: "A", release_date: "2001-01-01" }, { id: 2 }] });
    reply({ results: [] });
    const body = await (await search(req("/api/search?title=Amélie&year=2001"))).json();
    expect(body.results).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("query")).toBe("amélie");
    expect(url.searchParams.get("year")).toBe("2001");
  });

  it("lists French providers ordered by display priority", async () => {
    reply({
      results: [
        { provider_id: 2, provider_name: "B", display_priorities: { FR: 5 } },
        { provider_id: 1, provider_name: "A", display_priorities: { FR: 1 } },
        { provider_id: 3, provider_name: "C" },
      ],
    });
    const body = await (await providers(req("/api/providers"))).json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["1", "2", "3"]);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("watch_region")).toBe("FR");
  });

  it("discovers through streaming offers only", async () => {
    reply({ page: 2, total_pages: 9000, results: [{ id: 5, title: "X" }] });
    const body = await (
      await discover(req("/api/discover?providers=119,1899,119&maxRuntime=120&page=2"))
    ).json();
    expect(body).toMatchObject({ page: 2, totalPages: 500, results: [{ tmdbId: 5 }] });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("with_watch_providers")).toBe("119|1899");
    expect(url.searchParams.get("with_watch_monetization_types")).toBe("flatrate|free|ads");
    expect(url.searchParams.get("with_runtime.lte")).toBe("120");
    expect(url.searchParams.get("watch_region")).toBe("FR");
  });

  it("orders discover results by popularity, rating or year", async () => {
    reply({ results: [] });
    reply({ results: [] });
    reply({ results: [] });
    await discover(req("/api/discover?providers=8"));
    await discover(req("/api/discover?providers=8&sort=rating"));
    await discover(req("/api/discover?providers=8&sort=year"));
    const params = fetchMock.mock.calls.map((call) => new URL(call[0]).searchParams);
    expect(params[0].get("sort_by")).toBe("popularity.desc");
    expect(params[1].get("sort_by")).toBe("vote_average.desc");
    expect(params[1].get("vote_count.gte")).toBe("300");
    expect(params[2].get("sort_by")).toBe("primary_release_date.desc");
  });

  it("passes the fine filters to TMDB discover", async () => {
    reply({ results: [] });
    await discover(
      req(
        "/api/discover?providers=8&minRuntime=80&minRating=7.5&minYear=1990&maxYear=2010&genres=35,18",
      ),
    );
    const params = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(params.get("with_runtime.gte")).toBe("80");
    expect(params.get("vote_average.gte")).toBe("7.5");
    expect(params.get("vote_count.gte")).toBe("50");
    expect(params.get("primary_release_date.gte")).toBe("1990-01-01");
    expect(params.get("primary_release_date.lte")).toBe("2010-12-31");
    expect(params.get("with_genres")).toBe("18|35");
  });

  it("sends the token as a header only, never in the URL, with the 24 h revalidation", async () => {
    reply({ results: [] });
    await providers(req("/api/providers"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(KEY);
    expect(new URL(url).searchParams.has("api_key")).toBe(false);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.next).toEqual({ revalidate: 86_400 });
    expect(init.redirect).toBe("error");
  });

  it("normalizes the title and sorts providers so equivalent requests share a cache entry", async () => {
    reply({ results: [] });
    reply({ results: [] });
    reply({ results: [] });
    await search(req("/api/search?title=%20%20AMÉLIE%20%20Poulain"));
    await discover(req("/api/discover?providers=119,8"));
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("query")).toBe("amélie poulain");
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get("with_watch_providers")).toBe(
      "8|119",
    );
  });

  it("hides adult titles and untrusted offer links", async () => {
    reply({ id: 1, title: "X", adult: true });
    expect((await movie(req("/api/movie/1"), movieParams("1"))).status).toBe(404);

    const offer = { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] };
    expect(
      mapMovie({
        id: 1,
        title: "X",
        "watch/providers": { results: { FR: { ...offer, link: "https://evil.example/x" } } },
      })?.offersUrl,
    ).toBeNull();
    expect(
      mapMovie({
        id: 1,
        title: "X",
        "watch/providers": {
          results: { FR: { ...offer, link: "https://www.themoviedb.org/movie/1/watch" } },
        },
      })?.offersUrl,
    ).toBe("https://www.themoviedb.org/movie/1/watch");
  });
});

describe("errors", () => {
  it("keeps 404 for films only and logs the failing status and path, not the token", async () => {
    reply({}, 404);
    expect((await providers(req("/api/providers"))).status).toBe(502);
    reply({}, 401);
    await providers(req("/api/providers"));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("401");
    expect(logged).toContain("/watch/providers/movie");
    expect(logged).not.toContain(KEY);
  });

  it("maps an upstream 429 to 503 with Retry-After", async () => {
    reply({}, 429);
    const response = await providers(req("/api/providers"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("rejects a key that is not a v4 token", async () => {
    vi.stubEnv("TMDB_API_KEY", "not-a-bearer-token");
    expect((await providers(req("/api/providers"))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an unknown film to 404", async () => {
    reply({ status_message: "nope" }, 404);
    const response = await movie(req("/api/movie/1"), movieParams("1"));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("maps upstream failures to a typed 502 without echoing the key", async () => {
    reply({ status_message: `Invalid API key ${KEY}` }, 401);
    const response = await providers(req("/api/providers"));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text).error.code).toBe("upstream_error");
    expect(text).not.toContain(KEY);
  });

  it("maps a timeout to a typed 504", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const response = await providers(req("/api/providers"));
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("upstream_timeout");
  });

  it("maps a network failure and a non-JSON answer to 502", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for ?api_key=${KEY}`));
    const failed = await providers(req("/api/providers"));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain(KEY);

    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect((await providers(req("/api/providers"))).status).toBe(502);
  });

  it("flags incomplete film data as an upstream error", async () => {
    reply({ id: 1 });
    expect((await movie(req("/api/movie/1"), movieParams("1"))).status).toBe(502);
  });

  it("reports a missing key clearly instead of crashing", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    const response = await search(req("/api/search?title=a"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();

    const check = await health();
    expect(check.status).toBe(503);
    expect(await check.json()).toMatchObject({ ok: false, checks: { tmdb: { ok: false } } });
  });

  it("reports health when the key is set, without exposing it", async () => {
    const check = await health();
    expect(check.status).toBe(200);
    expect(JSON.stringify(await check.json())).not.toContain(KEY);
  });
});

describe("rate limit", () => {
  beforeEach(() => vi.stubEnv("RATE_LIMIT_PER_MINUTE", "60"));

  it("returns 429 beyond the limit, per client", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    for (let i = 0; i < 60; i++) {
      expect((await search(req("/api/search?title=a", "9.9.9.9"))).status).toBe(503);
    }
    const limited = await search(req("/api/search?title=a", "9.9.9.9"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect((await search(req("/api/search?title=a", "8.8.8.8"))).status).toBe(503);
  });

  it("keys on the entry our trusted proxy appended, and ignores junk", () => {
    const from = (value: string) =>
      clientKey(new Request("http://localhost/", { headers: { "x-forwarded-for": value } }));
    expect(from("6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
    expect(from("203.0.113.7:4711")).toBe("203.0.113.7");
    expect(from("[2001:db8:1:2:aaaa::1]:443")).toBe(from("2001:db8:1:2:bbbb::9"));
    expect(from("2001:db8::1")).toBe(from("2001:0db8:0:0:0:0:0:ffff"));
    expect(from("2001:DB8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(from("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(from("::1")).toBe("0000:0000:0000:0000::/64");
    expect(from("not-an-ip")).toBe("unknown");
    expect(from("x".repeat(5000))).toBe("unknown");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(from("6.6.6.6, 203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(from("6.6.6.6")).toBe("shared");
  });

  it("allows 600 requests per minute by default and ignores an invalid override", () => {
    const now = Date.now();
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "abc");
    for (let i = 0; i < 600; i++) expect(checkRateLimit("b", now)).toBeNull();
    expect(checkRateLimit("b", now)).not.toBeNull();
  });

  it("expires a window", () => {
    const now = Date.now();
    for (let i = 0; i < 61; i++) checkRateLimit("a", now);
    expect(checkRateLimit("a", now)).not.toBeNull();
    expect(checkRateLimit("a", now + 60_001)).toBeNull();
  });

  it("sends overflow clients to one shared bucket without evicting live counters", () => {
    const now = Date.now();
    for (let i = 0; i < 10_000; i++) checkRateLimit(`ip-${i}`, now);
    for (let i = 0; i < 59; i++) expect(checkRateLimit("newcomer", now)).toBeNull();
    expect(checkRateLimit("another", now)).toBeNull();
    expect(checkRateLimit("third", now)).not.toBeNull();
    expect(checkRateLimit("ip-0", now)).toBeNull();
  });
});
