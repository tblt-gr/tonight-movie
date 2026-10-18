import { MAX_GENRES } from "@/lib/genres";
import { MAX_RUNTIME } from "@/lib/validation";

export const SETTINGS_KEY = "tonight-movie:settings";
export const SETTINGS_VERSION = 1;
export const DB_NAME = "tonight-movie";
export const DB_VERSION = 1;
export const FILMS_STORE = "films";
export const LISTS_STORE = "lists";
export const RECENT_DRAWS_LIMIT = 5;

const MAX_ITEMS = 200;
const MAX_TEXT = 500;
const FIRST_FILM_YEAR = 1888;
const LAST_FILM_YEAR = 2100;

export type Settings = {
  /** Provider ids the visitor subscribes to. */
  services: string[];
  /** Ids of the lists the draw picks from. */
  sources: string[];
  /** Minimum runtime in minutes, `null` for no limit. */
  minDuration: number | null;
  /** Maximum runtime in minutes, `null` for no limit. */
  maxDuration: number | null;
  /** Minimum TMDB rating on a 0–10 scale, `null` for no limit. */
  minRating: number | null;
  /** Earliest and latest release year, `null` for no limit. */
  minYear: number | null;
  maxYear: number | null;
  /** French genre names, a film matches when it has any of them; empty for all genres. */
  genres: string[];
  excludeSeen: boolean;
  /** Film keys, newest first, capped at `RECENT_DRAWS_LIMIT`. */
  recentDraws: string[];
};

/** Compact on purpose: no poster, no synopsis. */
export type StoredFilm = {
  /** Letterboxd URI, or `title|year` when the import has none. */
  key: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  /** Match confidence between 0 and 1, `null` while unresolved. */
  confidence: number | null;
  /** Ids of the lists that contain the film. */
  lists: string[];
  seen: boolean;
};

export type StoredList = {
  id: string;
  name: string;
  /** Epoch milliseconds of the last import. */
  importedAt: number;
};

export const DEFAULT_SETTINGS: Settings = {
  services: [],
  sources: [],
  minDuration: null,
  maxDuration: null,
  minRating: null,
  minYear: null,
  maxYear: null,
  genres: [],
  excludeSeen: true,
  recentDraws: [],
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT ? value : null;
}

function textList(value: unknown, limit = MAX_ITEMS): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const items = value.map(text);
  return items.every((item) => item !== null) ? (items as string[]) : null;
}

function integerOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

/** A missing field takes `fallback`, so settings saved before a filter existed still load. */
function optional<T>(value: unknown, parse: (value: unknown) => T | undefined, fallback: T) {
  return value === undefined ? fallback : parse(value);
}

function ratingOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && value >= 0 && value <= 10 ? value : undefined;
}

export function filmKey(film: {
  letterboxdUri?: string | null;
  title: string;
  year: number | null;
}) {
  const uri = film.letterboxdUri?.trim();
  return uri || `${film.title.trim()}|${film.year ?? ""}`;
}

/** Returns a clean copy, or `null` when the value is not a settings object. */
export function parseSettings(value: unknown): Settings | null {
  if (!isObject(value)) return null;
  const services = textList(value.services);
  const sources = textList(value.sources);
  const recentDraws = textList(value.recentDraws, RECENT_DRAWS_LIMIT);
  const maxDuration = integerOrNull(value.maxDuration, 1, MAX_RUNTIME);
  const minDuration = optional(value.minDuration, (v) => integerOrNull(v, 1, MAX_RUNTIME), null);
  const minRating = optional(value.minRating, ratingOrNull, null);
  const minYear = optional(
    value.minYear,
    (v) => integerOrNull(v, FIRST_FILM_YEAR, LAST_FILM_YEAR),
    null,
  );
  const maxYear = optional(
    value.maxYear,
    (v) => integerOrNull(v, FIRST_FILM_YEAR, LAST_FILM_YEAR),
    null,
  );
  const genres = optional(value.genres, (v) => textList(v, MAX_GENRES) ?? undefined, []);
  if (!services || !sources || !recentDraws || !genres) return null;
  if (maxDuration === undefined || typeof value.excludeSeen !== "boolean") return null;
  if (minDuration === undefined || minRating === undefined) return null;
  if (minYear === undefined || maxYear === undefined) return null;
  return {
    services,
    sources,
    minDuration,
    maxDuration,
    minRating,
    minYear,
    maxYear,
    genres,
    excludeSeen: value.excludeSeen,
    recentDraws,
  };
}

export function parseFilm(value: unknown): StoredFilm | null {
  if (!isObject(value)) return null;
  const key = text(value.key);
  const title = text(value.title);
  const lists = textList(value.lists);
  const year = integerOrNull(value.year, FIRST_FILM_YEAR, LAST_FILM_YEAR);
  const tmdbId = integerOrNull(value.tmdbId, 1, Number.MAX_SAFE_INTEGER);
  const { confidence } = value;
  const validConfidence =
    confidence === null || (typeof confidence === "number" && confidence >= 0 && confidence <= 1);
  if (!key || !title || !lists || year === undefined || tmdbId === undefined) return null;
  if (!validConfidence || typeof value.seen !== "boolean") return null;
  return { key, title, year, tmdbId, confidence, lists, seen: value.seen };
}

export function parseList(value: unknown): StoredList | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const name = text(value.name);
  const { importedAt } = value;
  if (!id || !name || typeof importedAt !== "number" || !Number.isFinite(importedAt)) return null;
  return { id, name, importedAt };
}

/** Steps keyed by the version they upgrade from; each returns the next version's payload. */
export type Migrations = Record<number, (data: unknown) => unknown>;

export const SETTINGS_MIGRATIONS: Migrations = {};

/**
 * Brings a stored payload up to `target`. Returns `null` for a version that is
 * unknown, newer than this build, or missing a step, so the caller discards it.
 */
export function migrate(
  data: unknown,
  version: unknown,
  target: number,
  migrations: Migrations,
): unknown {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  if (version > target) return null;
  let current = data;
  for (let from = version; from < target; from += 1) {
    const step = migrations[from];
    if (!step) return null;
    current = step(current);
  }
  return current;
}
