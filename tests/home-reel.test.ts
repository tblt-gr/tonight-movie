import { describe, expect, it } from "vitest";
import { pickReel } from "@/lib/home-reel";
import type { MovieSummary } from "@/lib/types";

const film = (
  tmdbId: number,
  poster: string | null = `https://img/${tmdbId}.jpg`,
): MovieSummary => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  originalTitle: null,
  year: 2020,
  poster,
  rating: null,
});

describe("pickReel", () => {
  it("takes the first film of each provider, named after it", () => {
    const reel = pickReel([[film(1), film(2)], [film(3)], [film(4)]]);
    expect(reel.map((entry) => [entry.tmdbId, entry.provider])).toEqual([
      [1, "Netflix"],
      [3, "Prime Video"],
      [4, "Disney+"],
    ]);
  });

  it("skips a film without a poster and one an earlier provider already took", () => {
    const reel = pickReel([[film(1)], [film(1), film(2, null), film(3)], [film(1), film(4)]]);
    expect(reel.map((entry) => entry.tmdbId)).toEqual([1, 3, 4]);
  });

  it("leaves out a provider with nothing to show", () => {
    const reel = pickReel([[film(1)], [], [film(4)]]);
    expect(reel.map((entry) => entry.provider)).toEqual(["Netflix", "Disney+"]);
  });
});
