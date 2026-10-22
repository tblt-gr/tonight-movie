import {
  DEFAULT_LIMITS,
  IMPORT_MESSAGES,
  ImportError,
  parseLetterboxdExport,
  type ImportResult,
} from "@/lib/import/letterboxd";
import type { Dictionary } from "@/lib/i18n";
import { isDrawable } from "@/lib/match";
import { fetchSearch, resolveFilms, type Resolver } from "@/lib/resolve";
import type { FilmInput } from "@/lib/storage/library";
import type { StoredFilm, StoredList } from "@/lib/storage/schema";

export const WATCHLIST_ID = "watchlist";
export const LIKED_ID = "liked";
const LIST_PREFIX = "list:";

/** What the file contained, before any matching against TMDB. */
export type ImportSummary = {
  watchlist: number;
  lists: number;
  liked: number;
  seen: number;
  total: number;
};

/** What the draw can use once the films are matched. */
export type MatchStats = { drawable: number; toCheck: number };

export type ImportStore = Resolver & {
  getLists(): Promise<StoredList[]>;
  upsertList(list: StoredList): Promise<void>;
};

export type ImportProgress =
  { phase: "reading" } | { phase: "matching"; done: number; total: number };

export type ImportOutcome = { summary: ImportSummary; stats: MatchStats };

/** A user-facing sentence, in the visitor's language, for any failure raised by an import. */
export function describeImportError(error: unknown, t: Dictionary): string {
  return t.import.errors[error instanceof ImportError ? error.code : "generic"];
}

export function summarizeImport(result: ImportResult): ImportSummary {
  const count = (membership: string) =>
    result.films.filter((film) => film.memberships.includes(membership)).length;
  return {
    watchlist: count("watchlist"),
    lists: result.lists.length,
    liked: count("liked"),
    seen: count("seen"),
    total: result.films.length,
  };
}

export function matchStats(films: StoredFilm[], keys: ReadonlySet<string>): MatchStats {
  const imported = films.filter((film) => keys.has(film.key));
  const drawable = imported.filter(isDrawable).length;
  return { drawable, toCheck: imported.length - drawable };
}

/** The figures of everything stored, so they outlive the import that produced them. */
export function summarizeLibrary(films: StoredFilm[], lists: StoredList[]): ImportOutcome {
  const inList = (id: string) => films.filter((film) => film.lists.includes(id)).length;
  const stats = matchStats(films, new Set(films.map((film) => film.key)));
  return {
    summary: {
      watchlist: inList(WATCHLIST_ID),
      lists: lists.filter((list) => list.id.startsWith(LIST_PREFIX)).length,
      liked: inList(LIKED_ID),
      seen: films.filter((film) => film.seen).length,
      total: films.length,
    },
    stats,
  };
}

function listIdentity(membership: string): { id: string; name: string } | null {
  if (membership === "watchlist") return { id: WATCHLIST_ID, name: "Watchlist" };
  if (membership === "liked") return { id: LIKED_ID, name: "Films aimés" };
  if (membership.startsWith(LIST_PREFIX)) {
    return { id: membership, name: membership.slice(LIST_PREFIX.length) };
  }
  return null;
}

/**
 * Turns a parsed export into the records to store. Importing the same file again
 * yields no new list record, so stored data stays exactly as it was; a newer
 * file merges by film key through the library.
 */
export function planImport(
  result: ImportResult,
  existingFilms: StoredFilm[],
  existingLists: StoredList[],
  now: number,
): { films: FilmInput[]; lists: StoredList[] } {
  const known = new Map(existingFilms.map((film) => [film.key, film]));
  const names = new Map(existingLists.map((list) => [list.id, list.name]));
  const grown = new Set<string>();
  const present = new Map<string, string>();

  const films = result.films.map((film): FilmInput => {
    const lists: string[] = [];
    for (const membership of film.memberships) {
      const identity = listIdentity(membership);
      if (!identity) continue;
      lists.push(identity.id);
      present.set(identity.id, identity.name);
      if (!known.get(film.key)?.lists.includes(identity.id)) grown.add(identity.id);
    }
    return {
      key: film.key,
      title: film.title,
      year: film.year,
      tmdbId: null,
      confidence: null,
      lists,
      seen: film.memberships.includes("seen"),
    };
  });
  // A list without any film row is still the visitor's list.
  for (const name of result.lists) present.set(`${LIST_PREFIX}${name}`, name);

  const lists = [...present]
    .filter(([id, name]) => grown.has(id) || names.get(id) !== name)
    .map(([id, name]) => ({ id, name, importedAt: now }));
  return { films, lists };
}

export type ImportOptions = {
  limits?: { maxFileBytes: number };
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
  now?: () => number;
};

const SUPPORTED = /\.(zip|csv)$/i;

/**
 * Reads a chosen file, stores its films and lists, then matches the new films
 * with TMDB. Every check that can reject the file runs before anything is
 * written, so a refused file leaves the stored data untouched.
 */
export async function importExport(
  file: File,
  store: ImportStore,
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  const maxFileBytes = options.limits?.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes;
  options.onProgress?.({ phase: "reading" });
  if (file.size === 0) throw new ImportError("empty", IMPORT_MESSAGES.empty);
  if (!SUPPORTED.test(file.name)) {
    throw new ImportError(
      "unrecognized",
      "Ce type de fichier n’est pas pris en charge. Choisissez l’archive .zip de Letterboxd ou un fichier .csv.",
    );
  }
  if (file.size > maxFileBytes) {
    throw new ImportError("too_large", IMPORT_MESSAGES.too_large);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await parseLetterboxdExport(bytes, file.name);
  const summary = summarizeImport(result);

  const plan = planImport(
    result,
    await store.getFilms(),
    await store.getLists(),
    (options.now ?? Date.now)(),
  );
  await store.upsertFilms(plan.films);
  for (const list of plan.lists) await store.upsertList(list);

  const keys = result.films.map((film) => film.key);
  await resolveFilms(keys, store, fetchSearch(options.signal), {
    signal: options.signal,
    onProgress: (done, total) => options.onProgress?.({ phase: "matching", done, total }),
  });
  return { summary, stats: matchStats(await store.getFilms(), new Set(keys)) };
}

/** Films the draw cannot use yet: never matched, or matched without certainty. */
export const unsureFilms = (films: StoredFilm[]) =>
  films.filter((film) => film.confidence === null || !isDrawable(film));

const byTitle = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** The unsure films as a visitor reads them: alphabetical, then oldest first. */
export const listUnsureFilms = (films: StoredFilm[]) =>
  unsureFilms(films).sort(
    (a, b) => byTitle.compare(a.title, b.title) || (a.year ?? 0) - (b.year ?? 0),
  );

/**
 * Searches again for every film that is not a sure match, so a better search corrects
 * matches stored by an older one.
 */
export async function recheckFilms(
  store: ImportStore,
  options: Pick<ImportOptions, "onProgress" | "signal"> = {},
): Promise<MatchStats> {
  const unsure = unsureFilms(await store.getFilms());
  await store.upsertFilms(unsure.map((film) => ({ ...film, tmdbId: null, confidence: null })));
  const keys = unsure.map((film) => film.key);
  await resolveFilms(keys, store, fetchSearch(options.signal), {
    signal: options.signal,
    onProgress: (done, total) => options.onProgress?.({ phase: "matching", done, total }),
  });
  return matchStats(await store.getFilms(), new Set(keys));
}
