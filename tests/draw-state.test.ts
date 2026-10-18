import { describe, expect, it } from "vitest";
import { SERVICES_SOURCE_ID, tmdbKey } from "@/lib/draw";
import { getDictionary } from "@/lib/i18n";
import {
  buildDrawInput,
  countActiveFilters,
  drawReducer,
  keepOrder,
  limitAt,
  positionOf,
  durationOptions,
  noneMessage,
  offersToShow,
  roomLight,
  sourceOptions,
  swapDelays,
  hasOffers,
  offerGroups,
  offerHref,
  type DrawState,
} from "@/lib/draw-state";
import { DEFAULT_SETTINGS, type StoredFilm } from "@/lib/storage/schema";
import type { MovieDetails } from "@/lib/types";

const film = { tmdbId: 7, title: "Seven" } as MovieDetails;
const settings = { ...DEFAULT_SETTINGS, services: ["8"] };

describe("drawReducer", () => {
  const idle: DrawState = { phase: "idle" };
  const drawing = drawReducer(idle, { type: "start" });

  it("moves idle to drawing and ignores a second start", () => {
    expect(drawing).toEqual({ phase: "drawing" });
    expect(drawReducer(drawing, { type: "start" })).toBe(drawing);
  });

  it("settles a draw on a result, nothing found or an error", () => {
    expect(drawReducer(drawing, { type: "found", film, key: "k" })).toEqual({
      phase: "result",
      film,
      key: "k",
    });
    expect(drawReducer(drawing, { type: "none", reason: "all-seen" })).toEqual({
      phase: "none",
      reason: "all-seen",
    });
    expect(drawReducer(drawing, { type: "fail" })).toEqual({ phase: "error" });
  });

  it("ignores a settlement that no draw is waiting for", () => {
    expect(drawReducer(idle, { type: "found", film, key: "k" })).toBe(idle);
    expect(drawReducer(idle, { type: "fail" })).toBe(idle);
  });

  it("starts again from every settled phase", () => {
    const settled: DrawState[] = [
      { phase: "result", film, key: "k" },
      { phase: "none", reason: "no-candidates" },
      { phase: "error" },
    ];
    for (const state of settled) {
      expect(drawReducer(state, { type: "start" })).toEqual({ phase: "drawing" });
    }
  });
});

describe("swapDelays", () => {
  it("decelerates and lasts between 1.5 and 2 seconds", () => {
    const delays = swapDelays();
    const total = delays.reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeGreaterThanOrEqual(1500);
    expect(total).toBeLessThanOrEqual(2000);
    expect(delays[0]).toBe(70);
    expect(delays.every((delay, index) => index === 0 || delay > delays[index - 1])).toBe(true);
  });
});

describe("buildDrawInput", () => {
  const films: StoredFilm[] = [];
  const lists = [{ id: "watchlist" }];

  it("passes the saved settings to the engine", () => {
    const input = buildDrawInput(
      { ...settings, sources: ["watchlist"], maxDuration: 90, excludeSeen: false },
      films,
      lists,
      null,
    );
    expect(input.settings).toMatchObject({
      services: ["8"],
      sources: ["watchlist"],
      maxDuration: 90,
      excludeSeen: false,
    });
    expect(input.films).toBe(films);
    expect(input.lists).toBe(lists);
  });

  it("puts the film on screen first among the draws to avoid", () => {
    const input = buildDrawInput({ ...settings, recentDraws: ["a", "b"] }, films, lists, film);
    expect(input.settings.recentDraws).toEqual([tmdbKey(7), "a", "b"]);
  });
});

describe("options", () => {
  const lists = [
    { id: "watchlist", name: "Watchlist", importedAt: 1 },
    { id: "liked", name: "Films aimés", importedAt: 2 },
    { id: "own", name: "Ma liste", importedAt: 3 },
  ];

  it("lists the services source then every imported list", () => {
    expect(sourceOptions(lists, getDictionary("fr")).map((option) => option.id)).toEqual([
      SERVICES_SOURCE_ID,
      "watchlist",
      "liked",
      "own",
    ]);
  });

  it("names the built-in lists in the language of the page and keeps the others", () => {
    expect(sourceOptions(lists, getDictionary("en")).map((option) => option.name)).toEqual([
      "All the films on my services",
      "Watchlist",
      "Liked films",
      "Ma liste",
    ]);
  });

  it("keeps a saved duration that is not a preset, in order", () => {
    expect(durationOptions(100)).toContain(100);
    expect(durationOptions(100)).toEqual([...durationOptions(100)].sort((a, b) => a - b));
    expect(durationOptions(null)).toEqual(durationOptions(null).filter(Boolean));
  });
});

describe("noneMessage", () => {
  it("explains each reason and points to a way forward", () => {
    const reasons = ["no-candidates", "nothing-available", "all-seen", "all-too-long"] as const;
    for (const reason of reasons) {
      const message = noneMessage(reason, getDictionary("fr"));
      expect(message.reason.length).toBeGreaterThan(0);
      expect(message.hint.length).toBeGreaterThan(0);
    }
    expect(noneMessage("all-too-long", getDictionary("fr")).hint).toMatch(/durée/i);
    expect(noneMessage("all-too-long", getDictionary("en")).hint).toMatch(/runtime/i);
  });
});

describe("roomLight", () => {
  it("is dark only while a draw runs", () => {
    expect(roomLight("drawing")).toBe("dark");
    for (const phase of ["idle", "result", "none", "error"] as const) {
      expect(roomLight(phase)).toBe("lit");
    }
  });
});

describe("offerHref", () => {
  const film = { title: "Heat & Dust", offersUrl: "https://tmdb.example/film" };

  it("prefers a direct link, then the service's search page, then the offer, then TMDB", () => {
    expect(
      offerHref(film, { id: "8", url: null }, { "8": "https://www.netflix.com/title/1" }),
    ).toBe("https://www.netflix.com/title/1");
    expect(offerHref(film, { id: "8", url: null })).toBe(
      "https://www.netflix.com/search?q=Heat%20%26%20Dust",
    );
    expect(offerHref(film, { id: "999", url: "https://watch.example/999" })).toBe(
      "https://watch.example/999",
    );
    expect(offerHref(film, { id: "999", url: null })).toBe("https://tmdb.example/film");
    expect(offerHref({ ...film, offersUrl: null }, { id: "999", url: null })).toBeNull();
  });
});

describe("offerGroups", () => {
  const offer = (id: string, type: string) => ({ id, name: id, icon: null, type, url: null });

  it("splits streaming on my services, streaming elsewhere, and rent or buy", () => {
    const groups = offerGroups(
      {
        offers: [
          offer("8", "FLATRATE"),
          offer("9", "ADS"),
          offer("9", "FREE"),
          offer("8", "RENT"),
          offer("10", "RENT"),
          offer("10", "BUY"),
          offer("9", "BUY"),
        ],
      } as MovieDetails,
      new Set(["8"]),
    );
    expect(groups.owned.map((o) => o.id)).toEqual(["8"]);
    expect(groups.other.map((o) => [o.id, o.type])).toEqual([["9", "ADS"]]);
    expect(groups.rental.map((o) => [o.id, o.type])).toEqual([["10", "RENT"]]);
  });
});

describe("offersToShow", () => {
  const offer = (id: string, type: string) => ({ id, name: id, icon: null, type, url: null });
  it("keeps streaming offers on the visitor's services, once each", () => {
    const shown = offersToShow(
      {
        offers: [
          offer("8", "FLATRATE"),
          offer("8", "ADS"),
          offer("9", "FLATRATE"),
          offer("8", "RENT"),
        ],
      } as MovieDetails,
      new Set(["8"]),
    );
    expect(shown.map((item) => item.id)).toEqual(["8"]);
  });
});

describe("hasOffers", () => {
  const film = (status: string, offers: unknown[]) =>
    ({ availabilityStatus: status, offers }) as unknown as MovieDetails;

  it("is true only for a confirmed film with at least one offer", () => {
    expect(hasOffers(film("verified", [{}]))).toBe(true);
    expect(hasOffers(film("verified", []))).toBe(false);
    expect(hasOffers(film("unknown", [{}]))).toBe(false);
  });
});

describe("fine filters", () => {
  it("maps the slider end to no limit", () => {
    expect(limitAt(30, 30)).toBeNull();
    expect(limitAt(90, 30)).toBe(90);
    expect(positionOf(null, 240, 30, 240)).toBe(240);
    expect(positionOf(999, 240, 30, 240)).toBe(240);
    expect(positionOf(5, 240, 30, 240)).toBe(30);
  });

  it("keeps a minimum under its maximum by moving the other bound", () => {
    const pair = { lo: 120, hi: 100 };
    expect(keepOrder(pair, "lo", "hi", true)).toEqual({ lo: 120, hi: 120 });
    expect(keepOrder(pair, "hi", "lo", false)).toEqual({ lo: 100, hi: 100 });
    expect(keepOrder({ lo: 60, hi: null }, "lo", "hi", true)).toEqual({ lo: 60, hi: null });
  });

  it("counts a filter group once", () => {
    expect(countActiveFilters(DEFAULT_SETTINGS)).toBe(0);
    expect(
      countActiveFilters({
        ...DEFAULT_SETTINGS,
        minDuration: 60,
        maxDuration: 120,
        minRating: 7,
        genres: ["Drame"],
      }),
    ).toBe(3);
  });
});
