import { describe, expect, it } from "vitest";
import { SERVICES_SOURCE_ID, tmdbKey } from "@/lib/draw";
import {
  buildDrawInput,
  drawReducer,
  durationOptions,
  noneMessage,
  offersToShow,
  roomLight,
  sourceOptions,
  swapDelays,
  watchLinks,
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
  it("lists the services source then every imported list", () => {
    expect(
      sourceOptions([
        { id: "watchlist", name: "Watchlist", importedAt: 1 },
        { id: "own", name: "Ma liste", importedAt: 2 },
      ]).map((option) => option.id),
    ).toEqual([SERVICES_SOURCE_ID, "watchlist", "own"]);
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
      const message = noneMessage(reason);
      expect(message.reason.length).toBeGreaterThan(0);
      expect(message.hint.length).toBeGreaterThan(0);
    }
    expect(noneMessage("all-too-long").hint).toMatch(/durée/i);
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

describe("watchLinks", () => {
  const offer = (id: string, url: string | null, type = "FLATRATE") => ({
    id,
    name: id,
    icon: null,
    type,
    url,
  });

  it("returns one play link per confirmed streaming offer", () => {
    const links = watchLinks(
      {
        availabilityStatus: "verified",
        offersUrl: "https://tmdb.example/film",
        offers: [
          offer("8", "https://watch.example/8"),
          offer("9", null),
          offer("8", "https://ads.example", "ADS"),
        ],
      } as unknown as MovieDetails,
      new Set(["8"]),
    );
    expect(links).toEqual({
      verified: true,
      links: [{ id: "8", name: "8", href: "https://watch.example/8" }],
    });
  });

  it("stays unverified when the offer is missing or has nowhere to press play", () => {
    expect(
      watchLinks(
        {
          availabilityStatus: "unknown",
          offersUrl: "https://tmdb.example/film",
          offers: [],
        } as unknown as MovieDetails,
        new Set(["8"]),
      ),
    ).toEqual({ verified: false, links: [] });
    expect(
      watchLinks(
        {
          availabilityStatus: "verified",
          offersUrl: null,
          offers: [offer("8", null)],
        } as unknown as MovieDetails,
        new Set(["8"]),
      ),
    ).toEqual({ verified: false, links: [] });
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
