import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  classifyListFilm,
  filterGlobalResults,
  parseFilters,
  needsFullSort,
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
  order: patch.sort === "runtime" ? "asc" : "desc",
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
  trailer: null,
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

  it.each(["runtime", "year", "rating"] as const)("round-trips both directions for %s", (sort) => {
    for (const order of ["asc", "desc"] as const) {
      const state = filters({ sort, order });
      expect(parseFilters(new URLSearchParams(serializeFilters(state)))).toEqual(state);
    }
  });
  it("preserves the direction of existing links without an order parameter", () => {
    expect(parseFilters(new URLSearchParams("sort=runtime")).order).toBe("asc");
    expect(parseFilters(new URLSearchParams("sort=year")).order).toBe("desc");
    expect(parseFilters(new URLSearchParams("sort=rating&order=invalid")).order).toBe("desc");
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
    expect(sortsFor("services")).toEqual(["rank", "rating", "runtime", "year"]);
  });
});

describe("classifyListFilm", () => {
  it("waits for a verdict before deciding on an unresolved film", () => {
    expect(
      classifyListFilm(stored({ title: "A", confidence: null }), undefined, filters(), mine),
    ).toEqual({ verdict: "pending", uncertain: false });
  });

  it("keeps a weak match visible and flagged when any service will do", () => {
    const weak = stored({ title: "A", confidence: 0.5 });
    const result = classifyListFilm(
      weak,
      undefined,
      filters({ maxDuration: 60, genres: ["X"], services: ["all"] }),
      mine,
    );
    expect(result).toEqual({ verdict: "show", uncertain: true });
  });

  it("hides a weak match when filtering on services", () => {
    const weak = stored({ title: "A", confidence: 0.5 });
    expect(classifyListFilm(weak, undefined, filters(), mine).verdict).toBe("hide");
  });

  it("flags a film whose details failed to load when any service will do, else hides it", () => {
    const film = stored({ title: "A" });
    expect(classifyListFilm(film, "failed", filters({ services: ["all"] }), mine)).toEqual({
      verdict: "show",
      uncertain: true,
    });
    expect(classifyListFilm(film, "failed", filters(), mine).verdict).toBe("hide");
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

  it("hides an unknown offer when filtering on services", () => {
    const unknown = details({ offers: [], availabilityStatus: "unknown" });
    const film = stored({ title: "A" });
    expect(classifyListFilm(film, unknown, filters(), mine).verdict).toBe("hide");
    expect(classifyListFilm(film, unknown, filters({ services: ["8"] }), mine).verdict).toBe(
      "hide",
    );
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

  it("is exhausted when the final page is exactly full", () => {
    const all = new Map(films.map((film) => [film.tmdbId!, details()]));
    expect(planListPage(films, all, filters(), mine, films.length, 10).exhausted).toBe(true);
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
  for (const sort of ["rating", "runtime"] as const) {
    it(`slices the requested page after judging the whole source for ${sort}`, () => {
      const all = new Map(films.map((film) => [film.tmdbId!, details()]));
      const plan = planListPage(films, all, filters({ sort }), mine, 2, 2);
      expect(plan.shown).toHaveLength(2);
      expect(plan.pending).toEqual([]);
      expect(plan.done).toBe(true);
      expect(plan.exhausted).toBe(films.length <= 2);
    });

    it(`shows nothing until the whole source is judged, then the top of the ${sort} order`, () => {
      const many = Array.from({ length: 60 }, (_, i) =>
        stored({ title: `F${i + 1}`, tmdbId: i + 1 }),
      );
      const load = (from: number, to: number, loaded: Map<number, MovieDetails | "failed">) =>
        many
          .slice(from, to)
          .forEach((film) =>
            loaded.set(
              film.tmdbId!,
              details({ rating: film.tmdbId! / 10, runtime: 200 - film.tmdbId! }),
            ),
          );
      const loaded = new Map<number, MovieDetails | "failed">();
      load(0, 12, loaded);
      const first = planListPage(many, loaded, filters({ sort }), mine, 24, 12);
      expect(first.shown).toEqual([]);
      expect(first.pending).toHaveLength(12);
      expect(first.done).toBe(false);
      expect(first.judged).toBe(12);
      expect(first.total).toBe(60);
      load(12, 60, loaded);
      const full = planListPage(many, loaded, filters({ sort }), mine, 24, 12);
      expect(full.pending).toEqual([]);
      expect(full.done).toBe(true);
      expect(full.exhausted).toBe(false);
      expect(full.shown).toHaveLength(24);
      expect(full.shown[0].film.tmdbId).toBe(60);
    });
  }

  it("rules films out with stored facts and no lookup, and still needs one for the others", () => {
    const facts = { runtime: 150, rating: 6, year: 1999 };
    const film = stored({ title: "A", facts });
    const verdict = (patch: Partial<BrowseFilters>) =>
      classifyListFilm(film, undefined, filters(patch), mine).verdict;
    expect(verdict({ maxDuration: 120 })).toBe("hide");
    expect(verdict({ minDuration: 160 })).toBe("hide");
    expect(verdict({ minRating: 7 })).toBe("hide");
    expect(verdict({ maxDuration: 200, minRating: 5 })).toBe("pending");
    const undated = stored({ title: "B", year: null, facts });
    expect(classifyListFilm(undated, undefined, filters({ minYear: 2000 }), mine).verdict).toBe(
      "hide",
    );
  });

  it("orders by stored facts and looks up only the films of the page", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      stored({
        title: `F${i + 1}`,
        tmdbId: i + 1,
        facts: { runtime: 200 - i, rating: 5, year: 2000 },
      }),
    );
    const plan = planListPage(many, new Map(), filters({ sort: "runtime" }), mine, 10, 10);
    expect(plan.full).toBe(false);
    expect(plan.shown).toEqual([]);
    expect(plan.pending.map(({ tmdbId }) => tmdbId)).toEqual([
      40, 39, 38, 37, 36, 35, 34, 33, 32, 31,
    ]);
    const loaded = new Map(
      plan.pending.map((film) => [film.tmdbId!, details({ runtime: film.facts!.runtime })]),
    );
    const next = planListPage(many, loaded, filters({ sort: "runtime" }), mine, 10, 10);
    expect(next.shown.map(({ film }) => film.tmdbId)).toEqual([
      40, 39, 38, 37, 36, 35, 34, 33, 32, 31,
    ]);
    expect(next.done).toBe(true);
  });

  it("judges the whole source first while some matched films have no facts", () => {
    const many = [
      stored({ title: "A", tmdbId: 1, facts: { runtime: 90, rating: 5, year: 2000 } }),
      stored({ title: "B", tmdbId: 2 }),
    ];
    expect(needsFullSort("runtime", many)).toBe(true);
    expect(needsFullSort("title", many)).toBe(false);
    expect(needsFullSort("runtime", [many[0]])).toBe(false);
  });

  it("does not wait for films that will never have facts", () => {
    const films = [
      stored({ title: "A", tmdbId: 1, facts: { runtime: 90, rating: 5, year: 2000 } }),
      stored({ title: "Unmatched", tmdbId: null, confidence: null }),
      stored({ title: "Unsure", tmdbId: 3, confidence: 0.5 }),
    ];
    expect(needsFullSort("runtime", films)).toBe(false);
  });

  it("places a short film from a later batch first among all loaded films", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      stored({ title: i === 20 ? "The Kid" : `Film ${i}`, tmdbId: i + 1 }),
    );
    const loaded = new Map(
      many.map((film) => [film.tmdbId!, details({ runtime: film.title === "The Kid" ? 52 : 120 })]),
    );
    const plan = planListPage(many, loaded, filters({ sort: "runtime" }), mine, 24, 12);
    expect(plan.shown[0].film.title).toBe("The Kid");
    expect(plan.pending).toEqual([]);
    expect(plan.shown).toHaveLength(24);
  });

  it("keeps unknown values last and honours filters before taking a sorted page", () => {
    const all = new Map<number, MovieDetails | "failed">([
      [1, details({ rating: 9, runtime: 180 })],
      [2, "failed"],
      [3, details({ rating: 7, runtime: 90 })],
      [4, details({ rating: 8, runtime: 80 })],
      [5, details({ rating: 8, runtime: 100 })],
    ]);
    const plan = planListPage(
      films,
      all,
      filters({ sort: "rating", maxDuration: 120, services: ["all"] }),
      mine,
      10,
      2,
    );
    expect(plan.shown.map(({ film }) => film.title)).toEqual(["F4", "F5", "F3", "F2"]);
    expect(plan.shown.at(-1)?.uncertain).toBe(true);
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

  it.each([
    ["runtime", "asc", ["alpha", "Béta", "Gamma"]],
    ["runtime", "desc", ["Béta", "alpha", "Gamma"]],
    ["rating", "asc", ["Béta", "alpha", "Gamma"]],
    ["rating", "desc", ["alpha", "Béta", "Gamma"]],
    ["year", "asc", ["Gamma", "Béta", "alpha"]],
    ["year", "desc", ["alpha", "Béta", "Gamma"]],
  ] as const)("sorts all results by %s %s", (sort, order, expected) => {
    expect(titles(sortShown([c, a, b], sort, order))).toEqual(expected);
  });
  it("keeps unknown years last in either direction, using TMDB as a fallback", () => {
    const unknown = { ...c, film: { ...c.film, year: null } };
    const fallback = { ...b, film: { ...b.film, year: null }, detail: details({ year: 2010 }) };
    expect(titles(sortShown([unknown, a, fallback], "year", "asc"))).toEqual([
      "Béta",
      "alpha",
      "Gamma",
    ]);
    expect(titles(sortShown([unknown, a, fallback], "year", "desc"))).toEqual([
      "alpha",
      "Béta",
      "Gamma",
    ]);
  });

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
