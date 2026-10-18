import { RENT_TYPES, STREAM_TYPES } from "@/lib/catalog";
import { SERVICES_SOURCE_ID, tmdbKey, type DrawInput, type NoneReason } from "@/lib/draw";
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

export const SERVICES_SOURCE_LABEL = "Tous les films de mes services";

export function sourceOptions(lists: StoredList[]) {
  return [
    { id: SERVICES_SOURCE_ID, name: SERVICES_SOURCE_LABEL },
    ...lists.map((list) => ({ id: list.id, name: list.name })),
  ];
}

const DURATION_PRESETS = [90, 120, 150, 180];

/** The presets, plus a saved limit that is not one of them. */
export function durationOptions(current: number | null): number[] {
  const all =
    current !== null && !DURATION_PRESETS.includes(current)
      ? [...DURATION_PRESETS, current]
      : DURATION_PRESETS;
  return [...all].sort((a, b) => a - b);
}

export function durationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} maximum`;
}

export function noneMessage(reason: NoneReason): { reason: string; hint: string } {
  switch (reason) {
    case "no-candidates":
      return {
        reason: "Cette source ne contient aucun film à tirer.",
        hint: "Choisissez une autre source dans les réglages du tirage.",
      };
    case "nothing-available":
      return {
        reason: "Aucun film de cette source n’est disponible sur vos services.",
        hint: "Essayez une autre source, ou ajoutez des services dans les réglages.",
      };
    case "all-seen":
      return {
        reason: "Vous avez déjà vu les films trouvés.",
        hint: "Décochez « Exclure les films déjà vus » ou changez de source.",
      };
    case "all-too-long":
      return {
        reason: "Aucun film trouvé ne tient dans cette durée.",
        hint: "Allongez la durée maximale ou changez de source.",
      };
  }
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
