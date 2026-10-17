import { describe, expect, it } from "vitest";
import { categoryOf, isOwned, relevantOffers } from "@/lib/catalog";
import type { Film } from "@/lib/types";

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
