import { describe, expect, it } from "vitest";
import { categoryOf, isOwned, rankServices, relevantOffers } from "@/lib/catalog";
import type { Film, Offer } from "@/lib/types";

const film: Film = {
  rank: 1,
  title: "Example",
  year: 2020,
  letterboxdUrl: "https://letterboxd.com/film/example/",
  runtime: 120,
  rating: 4,
  genres: ["Drama"],
  tmdbId: null,
  justwatchId: "tm123",
  justwatchUrl: null,
  poster: null,
  offers: [
    { id: "amazonm6plus", name: "M6plus Amazon Channel", icon: null, type: "FLATRATE", url: null },
    { id: "amazon", name: "Amazon Video", icon: null, type: "RENT", url: null },
  ],
  matchScore: 1.3,
  availabilityStatus: "verified",
};

describe("availability categories", () => {
  it("keeps Prime channels separate from their direct services", () => {
    expect(isOwned("amazonm6plus", new Set(["m6"]))).toBe(false);
    expect(categoryOf(film, false, new Set(["m6"]))).toBe("other");
    expect(categoryOf(film, false, new Set(["amazonm6plus"]))).toBe("mine");
  });

  it("does not treat a Prime rental as included in Prime", () => {
    const rentalOnly = { ...film, offers: [film.offers[1]] };
    expect(categoryOf(rentalOnly, false, new Set(["prime"]))).toBe("none");
    expect(categoryOf(rentalOnly, true, new Set(["prime"]))).toBe("other");
    expect(relevantOffers(rentalOnly, true, new Set(["prime"]))).toHaveLength(1);
  });

  it("keeps uncertain matches out of the unavailable category", () => {
    expect(
      categoryOf({ ...film, justwatchId: null, availabilityStatus: "unknown" }, false, new Set()),
    ).toBe("unknown");
  });
});

const offer = (id: string, type: Offer["type"], name = `Service ${id}`): Offer => ({
  id,
  name,
  icon: null,
  type,
  url: null,
});
const verified = (...offers: Offer[]) => ({ offers, availabilityStatus: "verified" as const });

describe("rankServices", () => {
  it("counts a film once per provider even with several offer types", () => {
    const result = rankServices([verified(offer("8", "FLATRATE"), offer("8", "ADS"))], new Set());
    expect(result.ranking).toEqual([
      { id: "8", name: "Service 8", icon: null, count: 1, owned: false },
    ]);
  });

  it("ignores rent and buy", () => {
    const result = rankServices([verified(offer("8", "RENT"), offer("9", "BUY"))], new Set());
    expect(result.ranking).toEqual([]);
    expect(result.none).toBe(1);
  });

  it("counts unknown and missing films apart", () => {
    const result = rankServices(
      [{ offers: [offer("8", "FLATRATE")], availabilityStatus: "unknown" }, null],
      new Set(),
    );
    expect(result).toEqual({ ranking: [], unknown: 2, none: 0, total: 2 });
  });

  it("keeps Prime Video and a Prime channel separate", () => {
    const result = rankServices(
      [verified(offer("9", "FLATRATE"), offer("119", "FLATRATE"))],
      new Set(),
    );
    expect(result.ranking.map((row) => row.id).sort()).toEqual(["119", "9"]);
  });

  it("flags owned services", () => {
    const result = rankServices(
      [verified(offer("8", "FLATRATE"), offer("9", "FLATRATE"))],
      new Set(["8"]),
    );
    expect(result.ranking.find((row) => row.id === "8")?.owned).toBe(true);
    expect(result.ranking.find((row) => row.id === "9")?.owned).toBe(false);
  });

  it("sorts by count then name", () => {
    const result = rankServices(
      [
        verified(offer("2", "FLATRATE", "Zeta"), offer("1", "FLATRATE", "Alpha")),
        verified(offer("3", "FREE", "Beta"), offer("2", "FLATRATE", "Zeta")),
        verified(offer("3", "FREE", "Beta")),
      ],
      new Set(),
    );
    expect(result.ranking.map((row) => [row.name, row.count])).toEqual([
      ["Beta", 2],
      ["Zeta", 2],
      ["Alpha", 1],
    ]);
  });

  it("handles an empty list", () => {
    expect(rankServices([], new Set())).toEqual({ ranking: [], unknown: 0, none: 0, total: 0 });
  });
});
