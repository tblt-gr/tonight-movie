import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  classifyListFilm,
  filterGlobalResults,
  parseFilters,
  planListPage,
  seenIndex,
  serializeFilters,
  sortShown,
  sortsFor,
  type BrowseFilters,
  type Shown,
} from "@/lib/browse";
import type { StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails, MovieSummary } from "@/lib/types";

const filters = (patch: Partial<BrowseFilters> = {}): BrowseFilters => ({
  ...DEFAULT_FILTERS,
  ...patch,
});

const stored = (patch: Partial<StoredFilm> & { title: string }): StoredFilm => ({
  key: patch.title,
  year: 2000,
  tmdbId: 1,
  confidence: 1,
  lists: ["watchlist"],
  seen: false,
  ...patch,
});

const details = (patch: Partial<MovieDetails> = {}): MovieDetails => ({
  tmdbId: 1,
  title: "T",
  originalTitle: null,
  year: 2000,
  poster: null,
  rating: 7,
  overview: null,
  runtime: 100,
  genres: ["Drame"],
  directors: [],
  cast: [],
  offers: [{ id: "8", name: "Netflix", icon: null, type: "FLATRATE", url: null }],
  availabilityStatus: "verified",
  offersUrl: null,
  ...patch,
});

const mine = new Set(["8"]);

describe("URL state", () => {
  it("round-trips every filter", () => {
    const state = filters({
      query: "Alien & co",
      maxDuration: 120,
      services: ["8", "119"],
      genres: ["Drame", "Thriller"],
      source: "watchlist",
      minDuration: 60,
      minRating: 6.5,
      minYear: 1990,
      maxYear: 2020,
      hideSeen: true,
      sort: "rating",
      view: "list",
    });
    const query = serializeFilters(state);
    expect(parseFilters(new URLSearchParams(query))).toEqual(state);
  });

  it("leaves the URL empty for the defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });

  it("falls back to the defaults for invalid values", () => {
    const params = new URLSearchParams(
      "duration=abc&service=%3Cscript%3E,x&sort=nope&view=cube&seen=2&genres=nope&source=%3C&rating=99&from=12&until=abc&minduration=0",
    );
    expect(parseFilters(params)).toEqual(DEFAULT_FILTERS);
    expect(parseFilters(new URLSearchParams("duration=99999")).maxDuration).toBeNull();
  });
});

describe("sortsFor", () => {
  it("offers only the sorts the source can honour", () => {
    expect(sortsFor("lists")).toEqual(["rank", "rating", "runtime", "title", "year"]);
    expect(sortsFor("services")).toEqual(["rank", "rating", "year"]);
  });
});

describe("classifyListFilm", () => {
  it("waits for a verdict before deciding on an unresolved film", () => {
    expect(
      classifyListFilm(stored({ title: "A", confidence: null }), undefined, filters(), mine),
    ).toEqual({ verdict: "pending", uncertain: false });
  });

  it("keeps a weak match visible and flagged, whatever the filters say", () => {
    const weak = stored({ title: "A", confidence: 0.5 });
    const result = classifyListFilm(
      weak,
      undefined,
      filters({ maxDuration: 60, genres: ["X"] }),
      mine,
    );
    expect(result).toEqual({ verdict: "show", uncertain: true });
  });

  it("keeps a film whose details failed to load, flagged", () => {
    const result = classifyListFilm(stored({ title: "A" }), "failed", filters(), mine);
    expect(result).toEqual({ verdict: "show", uncertain: true });
  });

  it("shows a film available on the visitor's services", () => {
    expect(classifyListFilm(stored({ title: "A" }), details(), filters(), mine)).toEqual({
      verdict: "show",
      uncertain: false,
    });
  });

  it("hides a film verified as not streaming on the services, unless asked for any", () => {
    const elsewhere = details({
      offers: [{ id: "99", name: "Autre", icon: null, type: "FLATRATE", url: null }],
    });
    const film = stored({ title: "A" });
    expect(classifyListFilm(film, elsewhere, filters(), mine).verdict).toBe("hide");
    expect(classifyListFilm(film, elsewhere, filters({ services: ["all"] }), mine).verdict).toBe(
      "show",
    );
  });

  it("never counts rent or buy as streaming", () => {
    const rental = details({
      offers: [{ id: "8", name: "Netflix", icon: null, type: "RENT", url: null }],
    });
    expect(classifyListFilm(stored({ title: "A" }), rental, filters(), mine).verdict).toBe("hide");
  });

  it("flags an unknown offer instead of hiding the film", () => {
    const unknown = details({ offers: [], availabilityStatus: "unknown" });
    expect(classifyListFilm(stored({ title: "A" }), unknown, filters(), mine)).toEqual({
      verdict: "show",
      uncertain: true,
    });
  });

  it("filters on one service", () => {
    const film = stored({ title: "A" });
    expect(classifyListFilm(film, details(), filters({ services: ["8"] }), mine).verdict).toBe(
      "show",
    );
    expect(classifyListFilm(film, details(), filters({ services: ["9"] }), mine).verdict).toBe(
      "hide",
    );
  });

  it("shows a film streaming on a service the visitor does not own when that service is chosen", () => {
    const film = stored({ title: "A" });
    const elsewhere = details({
      offers: [{ id: "99", name: "Autre", icon: null, type: "FLATRATE", url: null }],
    });
    expect(classifyListFilm(film, elsewhere, filters({ services: ["99"] }), mine).verdict).toBe(
      "show",
    );
    expect(classifyListFilm(film, details(), filters({ services: ["99"] }), mine).verdict).toBe(
      "hide",
    );
  });

  it("filters on duration, treating an unknown runtime as too long", () => {
    const film = stored({ title: "A" });
    const limit = filters({ maxDuration: 90 });
    expect(classifyListFilm(film, details({ runtime: 80 }), limit, mine).verdict).toBe("show");
    expect(classifyListFilm(film, details({ runtime: 100 }), limit, mine).verdict).toBe("hide");
    expect(classifyListFilm(film, details({ runtime: null }), limit, mine).verdict).toBe("hide");
  });

  it("shows a film streaming on any of several chosen services", () => {
    const film = stored({ title: "A" });
    const verdict = (ids: string[]) =>
      classifyListFilm(film, details(), filters({ services: ids }), mine).verdict;
    expect(verdict(["9", "8"])).toBe("show");
    expect(verdict(["9", "10"])).toBe("hide");
  });

  it("filters on rating, minimum runtime and release year", () => {
    const film = stored({ title: "A" });
    const verdict = (patch: Partial<BrowseFilters>, detail = details()) =>
      classifyListFilm(film, detail, filters(patch), mine).verdict;
    expect(verdict({ minRating: 8 })).toBe("hide");
    expect(verdict({ minRating: 7 })).toBe("show");
    expect(verdict({ minDuration: 150 }, details({ runtime: 100 }))).toBe("hide");
    expect(verdict({ minDuration: 90 }, details({ runtime: 100 }))).toBe("show");
    expect(verdict({ minYear: 2010 })).toBe("hide");
    expect(verdict({ maxYear: 1990 })).toBe("hide");
    expect(verdict({ minYear: 1990, maxYear: 2010 })).toBe("show");
  });

  it("filters on genre", () => {
    const film = stored({ title: "A" });
    expect(classifyListFilm(film, details(), filters({ genres: ["Drame"] }), mine).verdict).toBe(
      "show",
    );
    expect(classifyListFilm(film, details(), filters({ genres: ["Horreur"] }), mine).verdict).toBe(
      "hide",
    );
  });

  it("filters on title without accents or case, and on the seen flag", () => {
    const film = stored({ title: "Amélie" });
    expect(classifyListFilm(film, details(), filters({ query: "amelie" }), mine).verdict).toBe(
      "show",
    );
    expect(classifyListFilm(film, details(), filters({ query: "zzz" }), mine).verdict).toBe("hide");
    const seen = stored({ title: "Amélie", seen: true });
    expect(classifyListFilm(seen, details(), filters({ hideSeen: true }), mine).verdict).toBe(
      "hide",
    );
    expect(classifyListFilm(seen, undefined, filters({ hideSeen: true }), mine).verdict).toBe(
      "hide",
    );
  });
});

describe("planListPage", () => {
  const films = [1, 2, 3, 4, 5].map((n) => stored({ title: `F${n}`, tmdbId: n }));
  const loaded = new Map<number, MovieDetails | "failed">([
    [1, details({ tmdbId: 1 })],
    [2, details({ tmdbId: 2, offers: [] })],
  ]);

  it("shows what it can judge and asks for the films it cannot judge yet", () => {
    const plan = planListPage(films, loaded, filters(), mine, 2, 10);
    expect(plan.shown.map((item) => item.film.title)).toEqual(["F1"]);
    expect(plan.pending.map((film) => film.title)).toEqual(["F3", "F4", "F5"]);
    expect(plan.done).toBe(false);
  });

  it("is done once the page is full", () => {
    const all = new Map(films.map((film) => [film.tmdbId!, details({ tmdbId: film.tmdbId! })]));
    const plan = planListPage(films, all, filters(), mine, 3, 10);
    expect(plan.shown).toHaveLength(3);
    expect(plan.pending).toEqual([]);
    expect(plan.done).toBe(true);
    expect(plan.exhausted).toBe(false);
  });

  it("caps the batch of films to look up", () => {
    const plan = planListPage(films, new Map(), filters(), mine, 5, 2);
    expect(plan.pending).toHaveLength(2);
  });

  it("is done with fewer films when the list is exhausted", () => {
    const all = new Map(films.map((film) => [film.tmdbId!, details({ tmdbId: film.tmdbId! })]));
    const plan = planListPage(films, all, filters(), mine, 24, 10);
    expect(plan.shown).toHaveLength(5);
    expect(plan.done).toBe(true);
    expect(plan.exhausted).toBe(true);
  });

  it("walks in title order for the title sort", () => {
    const reversed = [stored({ title: "B", tmdbId: 1 }), stored({ title: "A", tmdbId: 2 })];
    const all = new Map([
      [1, details({ tmdbId: 1 })],
      [2, details({ tmdbId: 2 })],
    ]);
    const plan = planListPage(reversed, all, filters({ sort: "title" }), mine, 1, 10);
    expect(plan.shown.map((item) => item.film.title)).toEqual(["A"]);
  });
});

describe("sortShown", () => {
  const item = (title: string, year: number, d?: Partial<MovieDetails>): Shown => ({
    film: stored({ title, year }),
    detail: d ? details(d) : undefined,
    uncertain: false,
  });
  const a = item("Béta", 1999, { rating: 6, runtime: 120 });
  const b = item("alpha", 2010, { rating: 8, runtime: 90 });
  const c = item("Gamma", 1980);
  const titles = (items: Shown[]) => items.map((entry) => entry.film.title);

  it("keeps the list order", () => {
    expect(titles(sortShown([a, b, c], "rank"))).toEqual(["Béta", "alpha", "Gamma"]);
  });
  it("sorts by title ignoring case and accents", () => {
    expect(titles(sortShown([c, b, a], "title"))).toEqual(["alpha", "Béta", "Gamma"]);
  });
  it("sorts by year, newest first", () => {
    expect(titles(sortShown([a, b, c], "year"))).toEqual(["alpha", "Béta", "Gamma"]);
  });
  it("sorts by rating, best first, unknown last", () => {
    expect(titles(sortShown([c, a, b], "rating"))).toEqual(["alpha", "Béta", "Gamma"]);
  });
  it("sorts by duration, shortest first, unknown last", () => {
    expect(titles(sortShown([c, a, b], "runtime"))).toEqual(["alpha", "Béta", "Gamma"]);
  });
});

describe("global results", () => {
  const movie = (tmdbId: number, title: string, year: number | null): MovieSummary => ({
    tmdbId,
    title,
    originalTitle: null,
    year,
    poster: null,
    rating: null,
  });

  it("hides films the visitor has seen, by TMDB id or by title and year", () => {
    const index = seenIndex([
      stored({ title: "Seven", year: 1995, tmdbId: 807, seen: true }),
      stored({ title: "Le Pianiste", year: 2002, tmdbId: null, confidence: null, seen: true }),
      stored({ title: "Unseen", tmdbId: 5, seen: false }),
    ]);
    const results = [
      movie(807, "Se7en", 1995),
      movie(9, "Pianiste", 2002),
      movie(5, "Unseen", 2000),
    ];
    expect(filterGlobalResults(results, index, true).map((m) => m.tmdbId)).toEqual([5]);
    expect(filterGlobalResults(results, index, false)).toHaveLength(3);
  });
});
