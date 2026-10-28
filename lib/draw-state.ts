import { RENT_TYPES, STREAM_TYPES } from "@/lib/catalog";
import { SERVICES_SOURCE_ID, tmdbKey, type DrawInput, type NoneReason } from "@/lib/draw";
import type { Dictionary } from "@/lib/i18n";
import { LIKED_ID, WATCHLIST_ID } from "@/lib/import/apply";
import type { Settings, StoredFilm, StoredList } from "@/lib/storage/schema";
import { providerSearchUrl } from "@/lib/provider-links";
import type { MovieDetails, Offer } from "@/lib/types";

export type DrawState =
  | { phase: "idle" }
  | { phase: "drawing" }
  | { phase: "result"; film: MovieDetails; key: string }
  | { phase: "none"; reason: NoneReason }
  | { phase: "error" };

export type DrawAction =
  | { type: "start" }
  | { type: "found"; film: MovieDetails; key: string }
  | { type: "none"; reason: NoneReason }
  | { type: "fail" };

export type DrawPhase = DrawState["phase"];

export type RoomLight = "lit" | "dark";

/**
 * The room is dark only while a draw runs. It is derived from the phase and never stored,
 * so a settled draw, an error or a leftover timer cannot leave the lights out.
 */
export function roomLight(phase: DrawPhase): RoomLight {
  return phase === "drawing" ? "dark" : "lit";
}

/** A draw can start anywhere but while one runs; only a running draw can settle. */
export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  if (action.type === "start") {
    return state.phase === "drawing" ? state : { phase: "drawing" };
  }
  if (state.phase !== "drawing") return state;
  switch (action.type) {
    case "found":
      return { phase: "result", film: action.film, key: action.key };
    case "none":
      return { phase: "none", reason: action.reason };
    case "fail":
      return { phase: "error" };
  }
}

const SWAP_FIRST_MS = 70;
const SWAP_SLOWDOWN = 1.13;
const SWAP_LAST_MS = 300;

/** Pauses between poster swaps: 70 ms, each 13% longer, until the next would pass 300 ms. */
export function swapDelays(): number[] {
  const delays: number[] = [];
  for (let delay = SWAP_FIRST_MS; delay <= SWAP_LAST_MS; delay *= SWAP_SLOWDOWN) {
    delays.push(Math.round(delay));
  }
  return delays;
}

/**
 * The engine input for the saved settings. The film on screen goes first among the
 * recent draws so a redraw cannot return it, even when it came from another source.
 */
export function buildDrawInput(
  settings: Settings,
  films: StoredFilm[],
  lists: Pick<StoredList, "id">[],
  current: Pick<MovieDetails, "tmdbId"> | null,
): DrawInput {
  const recentDraws = current
    ? [tmdbKey(current.tmdbId), ...settings.recentDraws]
    : settings.recentDraws;
  return { settings: { ...settings, recentDraws }, films, lists };
}

/** The name of a list: the two built-in ones follow the language, the others keep their name. */
export function listLabel(list: Pick<StoredList, "id" | "name">, t: Dictionary): string {
  if (list.id === WATCHLIST_ID) return t.lists.watchlist;
  if (list.id === LIKED_ID) return t.lists.liked;
  return list.name;
}

export function sourceOptions(lists: StoredList[], t: Dictionary) {
  return [
    { id: SERVICES_SOURCE_ID, name: t.draw.allServices },
    ...lists.map((list) => ({ id: list.id, name: listLabel(list, t) })),
  ];
}

/** Scale shared by the minimum and maximum runtime sliders; either end means "no limit". */
export const DURATION_SCALE = { min: 30, max: 240, step: 5 };
/** Rating slider; the lowest step means "no limit". */
export const RATING_SCALE = { min: 0, max: 9, step: 0.5 };
export const FIRST_YEAR = 1920;

/** Year slider, whose ends mean "no limit". */
export const yearScale = (now = new Date()) => ({
  min: FIRST_YEAR,
  max: now.getFullYear(),
  step: 1,
});

/** The limit a slider position stands for: `null` at the end that means "no limit". */
export function limitAt(value: number, edge: number): number | null {
  return value === edge ? null : value;
}

/** Where a slider sits for a saved limit, kept inside the scale. */
export function positionOf(limit: number | null, edge: number, min: number, max: number): number {
  return limit === null ? edge : Math.min(max, Math.max(min, limit));
}

/** Keeps a minimum from passing its maximum: the bound that was not moved gives way. */
export function keepOrder<K extends string>(
  pair: Record<K, number | null>,
  moved: K,
  other: K,
  lowIsMoved: boolean,
): Record<K, number | null> {
  const [low, high] = lowIsMoved ? [pair[moved], pair[other]] : [pair[other], pair[moved]];
  if (low === null || high === null || low <= high) return pair;
  return { ...pair, [other]: pair[moved] };
}

/** How many fine filters differ from "no limit". */
export function countActiveFilters(
  settings: Pick<
    Settings,
    "minDuration" | "maxDuration" | "minRating" | "minYear" | "maxYear" | "genres"
  >,
): number {
  return [
    settings.minDuration !== null || settings.maxDuration !== null,
    settings.minRating !== null,
    settings.minYear !== null || settings.maxYear !== null,
    settings.genres.length > 0,
  ].filter(Boolean).length;
}

export function hoursLabel(minutes: number, t: Dictionary) {
  return t.format.runtime(minutes);
}

export function noneMessage(reason: NoneReason, t: Dictionary): { reason: string; hint: string } {
  return t.draw.none[reason];
}

/** Streaming offers on the visitor's services, one per service. */
export function offersToShow(film: Pick<MovieDetails, "offers">, services: ReadonlySet<string>) {
  return offerGroups(film, services).owned;
}

/**
 * The offers of a film in three groups, one per service: streaming on the visitor's services,
 * streaming elsewhere, and rent or buy. Rent and buy never count as a subscription, so a
 * service that also streams the film only shows up as streaming.
 */
export function offerGroups(film: Pick<MovieDetails, "offers">, services: ReadonlySet<string>) {
  const owned = new Map<string, Offer>();
  const other = new Map<string, Offer>();
  const rental = new Map<string, Offer>();
  for (const offer of film.offers) {
    if (STREAM_TYPES.has(offer.type)) {
      const group = services.has(offer.id) ? owned : other;
      if (!group.has(offer.id)) group.set(offer.id, offer);
    }
  }
  for (const offer of film.offers) {
    if (RENT_TYPES.has(offer.type) && !owned.has(offer.id) && !other.has(offer.id)) {
      if (!rental.has(offer.id)) rental.set(offer.id, offer);
    }
  }
  return { owned: [...owned.values()], other: [...other.values()], rental: [...rental.values()] };
}

/** True when the film has a confirmed offer a direct link could be looked up for. */
export function hasOffers(film: Pick<MovieDetails, "offers" | "availabilityStatus">): boolean {
  return film.availabilityStatus === "verified" && film.offers.length > 0;
}

/** A direct link to the film, else the provider's search page, else the offer's link, else TMDB. */
export function offerHref(
  film: Pick<MovieDetails, "title" | "offersUrl">,
  offer: Pick<Offer, "id" | "url">,
  direct: Readonly<Record<string, string>> = {},
): string | null {
  return direct[offer.id] ?? providerSearchUrl(offer.id, film.title) ?? offer.url ?? film.offersUrl;
}
