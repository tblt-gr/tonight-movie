import {
  parseFilm,
  parseList,
  parseSettings,
  type Settings,
  type StoredFilm,
  type StoredList,
} from "@/lib/storage/schema";

export const BACKUP_APP = "tonight-movie";
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILMS = 100_000;
const MAX_LISTS = 2_000;

/** Everything the visitor produced; the public TMDB caches are left out, TMDB gives them back. */
export type Backup = {
  app: typeof BACKUP_APP;
  version: number;
  /** Epoch milliseconds of the export. */
  exportedAt: number;
  settings: Settings;
  films: StoredFilm[];
  lists: StoredList[];
};

export type BackupErrorCode = "too_large" | "unreadable" | "unrecognized" | "newer" | "invalid";

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code);
  }
}

export const createBackup = (
  settings: Settings,
  films: StoredFilm[],
  lists: StoredList[],
  now = Date.now(),
): Backup => ({
  app: BACKUP_APP,
  version: BACKUP_VERSION,
  exportedAt: now,
  settings,
  films,
  lists,
});

/**
 * Reads a backup file's text. Every record goes through the same checks as stored data and a
 * single bad one refuses the whole file, so a restore never leaves a half-written library.
 */
export function parseBackup(text: string): Backup {
  if (text.length > BACKUP_MAX_BYTES) throw new BackupError("too_large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError("unreadable");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackupError("unrecognized");
  }
  const data = value as Record<string, unknown>;
  if (data.app !== BACKUP_APP || typeof data.version !== "number") {
    throw new BackupError("unrecognized");
  }
  if (data.version > BACKUP_VERSION) throw new BackupError("newer");
  if (!Array.isArray(data.films) || !Array.isArray(data.lists)) throw new BackupError("invalid");
  if (data.films.length > MAX_FILMS || data.lists.length > MAX_LISTS) {
    throw new BackupError("too_large");
  }
  const settings = parseSettings(data.settings);
  const films = data.films.map(parseFilm);
  const lists = data.lists.map(parseList);
  if (!settings || films.includes(null) || lists.includes(null)) throw new BackupError("invalid");
  const exportedAt = typeof data.exportedAt === "number" ? data.exportedAt : 0;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt,
    settings,
    films: [...new Map((films as StoredFilm[]).map((film) => [film.key, film])).values()],
    lists: [...new Map((lists as StoredList[]).map((list) => [list.id, list])).values()],
  };
}
