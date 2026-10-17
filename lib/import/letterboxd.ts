import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { parseCsv } from "@/lib/import/csv";
import { filmKey } from "@/lib/storage/schema";

export type ImportLimits = {
  /** Size of the file the visitor picks. */
  maxFileBytes: number;
  /** Bytes actually inflated from the archive, counted while extracting. */
  maxUncompressedBytes: number;
  /** Inflated bytes allowed per byte of archive. */
  maxRatio: number;
  maxRows: number;
  maxEntries: number;
};

export const DEFAULT_LIMITS: ImportLimits = {
  maxFileBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxRatio: 100,
  maxRows: 50_000,
  maxEntries: 5_000,
};

export type ImportErrorCode = "unrecognized" | "too_large" | "too_many_rows" | "corrupt";

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

const MESSAGES: Record<ImportErrorCode, string> = {
  unrecognized:
    "Ce fichier n’est pas reconnu. Importez l’export complet de Letterboxd (.zip) ou un fichier watchlist.csv.",
  too_large: "Ce fichier est trop volumineux pour être importé.",
  too_many_rows: "Ce fichier contient trop de films pour être importé.",
  corrupt: "Ce fichier est illisible ou endommagé.",
};

const fail = (code: ImportErrorCode): never => {
  throw new ImportError(code, MESSAGES[code]);
};

export type ImportedFilm = {
  /** Letterboxd URI, or `title|year` when the file has none. */
  key: string;
  title: string;
  year: number | null;
  uri: string | null;
  /** `watchlist`, `list:<name>`, `liked` and `seen`. */
  memberships: string[];
};

export type ImportResult = {
  films: ImportedFilm[];
  /** Names of the visitor's own lists found in the file. */
  lists: string[];
};

type Source = { membership: string; text: string; fallbackName: string };

const MAX_TITLE = 500;
const MAX_LIST_NAME = 200;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const SKIPPED_FOLDERS = new Set(["deleted", "orphaned"]);
const NOT_A_FILM_FILE = new Set([
  "ratings",
  "diary",
  "reviews",
  "comments",
  "profile",
  "watchlist-removed",
]);
const FOREIGN_COLUMNS = ["rating", "review", "comment", "rewatch"];

const cell = (value: string | undefined) => (value ?? "").trim();
const lower = (row: string[]) => row.map((value) => cell(value).toLowerCase());

function isTrustedUri(value: string) {
  return /^https:\/\/(boxd\.it|letterboxd\.com)\/[^\s]*$/.test(value);
}

function parseYear(value: string) {
  return /^\d{4}$/.test(value) ? Number(value) : null;
}

/** A list export starts with a metadata block that the film rows follow. */
function readRows(rows: string[][]) {
  const header = rows.findIndex((row) => {
    const names = lower(row);
    return names.includes("name") && names.includes("year");
  });
  if (header === -1) return null;
  const columns = lower(rows[header]);
  const uri = columns.findIndex((name) => name === "letterboxd uri" || name === "url");
  return {
    header,
    columns,
    name: columns.indexOf("name"),
    year: columns.indexOf("year"),
    uri,
  };
}

function listName(rows: string[][], header: number) {
  const meta = rows.slice(0, header).findIndex((row) => {
    const names = lower(row);
    return names.includes("name") && names.includes("url");
  });
  if (meta === -1) return null;
  const name = cell(rows[meta + 1]?.[lower(rows[meta]).indexOf("name")]);
  return name ? name.slice(0, MAX_LIST_NAME) : null;
}

class Collector {
  private readonly films = new Map<string, ImportedFilm>();
  readonly lists: string[] = [];

  constructor(private readonly limits: ImportLimits) {}

  addSource({ membership, text, fallbackName }: Source) {
    const rows = parseCsv(text, this.limits.maxRows + 20, () => fail("too_many_rows"));
    const layout = readRows(rows);
    if (!layout) return fail("unrecognized");
    if (membership === "list") {
      if (layout.columns.some((name) => FOREIGN_COLUMNS.includes(name))) {
        return fail("unrecognized");
      }
      const name = listName(rows, layout.header) ?? fallbackName;
      membership = `list:${name}`;
      if (!this.lists.includes(name)) this.lists.push(name);
    }
    for (const row of rows.slice(layout.header + 1)) {
      const title = cell(row[layout.name]);
      if (!title || title.length > MAX_TITLE) continue;
      const year = parseYear(cell(row[layout.year]));
      const rawUri = layout.uri === -1 ? "" : cell(row[layout.uri]);
      const uri = isTrustedUri(rawUri) ? rawUri : null;
      const key = filmKey({ letterboxdUri: uri, title, year });
      const known = this.films.get(key);
      if (known) {
        if (!known.memberships.includes(membership)) known.memberships.push(membership);
      } else {
        if (this.films.size >= this.limits.maxRows) fail("too_many_rows");
        this.films.set(key, { key, title, year, uri, memberships: [membership] });
      }
    }
  }

  result(): ImportResult {
    if (this.films.size === 0 && this.lists.length === 0) return fail("unrecognized");
    return { films: [...this.films.values()], lists: this.lists };
  }
}

/** Picks the membership a zip entry feeds, or `null` for files that are never read. */
function classifyEntry(path: string): { membership: string; fallbackName: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => SKIPPED_FOLDERS.has(part.toLowerCase()))) return null;
  const file = parts[parts.length - 1]?.toLowerCase() ?? "";
  const folder = parts[parts.length - 2]?.toLowerCase();
  if (!file.endsWith(".csv")) return null;
  const base = file.slice(0, -4);
  if (folder === "lists") {
    return { membership: "list", fallbackName: parts[parts.length - 1].slice(0, -4) };
  }
  if (folder === "likes")
    return base === "films" ? { membership: "liked", fallbackName: "" } : null;
  if (base === "watchlist") return { membership: "watchlist", fallbackName: "" };
  if (base === "watched") return { membership: "seen", fallbackName: "" };
  return null;
}

function classifyCsv(fileName: string): { membership: string; fallbackName: string } {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "");
  const key = base.toLowerCase();
  if (key === "watchlist") return { membership: "watchlist", fallbackName: "" };
  if (key === "watched") return { membership: "seen", fallbackName: "" };
  if (key === "films") return { membership: "liked", fallbackName: "" };
  if (NOT_A_FILM_FILE.has(key)) return fail("unrecognized");
  return { membership: "list", fallbackName: base.slice(0, MAX_LIST_NAME) || "Liste" };
}

const isZip = (bytes: Uint8Array) => ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
const decode = (chunks: Uint8Array[], size: number) => {
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(joined);
};

// Small pushes bound how much a single compressed chunk can inflate at once.
const CHUNK = 16 * 1024;
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Inflates only the files the import needs, counting the bytes that really come
 * out rather than trusting the sizes declared in the archive.
 */
async function readZip(bytes: Uint8Array, limits: ImportLimits): Promise<Source[]> {
  const maxInflated = Math.min(limits.maxUncompressedBytes, bytes.length * limits.maxRatio);
  const sources: Source[] = [];
  let inflated = 0;
  let entries = 0;
  let failure: ImportError | null = null;

  const unzip = new Unzip((file) => {
    if (failure) return;
    entries += 1;
    if (entries > limits.maxEntries) {
      failure = new ImportError("too_large", MESSAGES.too_large);
      return;
    }
    const target = classifyEntry(file.name);
    if (!target) return;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = new ImportError("corrupt", MESSAGES.corrupt);
        return;
      }
      inflated += chunk.length;
      if (inflated > maxInflated) {
        failure = new ImportError("too_large", MESSAGES.too_large);
        file.terminate();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
      if (final) sources.push({ ...target, text: decode(chunks, size) });
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  try {
    for (let offset = 0; offset < bytes.length && !failure; offset += CHUNK) {
      const end = Math.min(offset + CHUNK, bytes.length);
      unzip.push(bytes.subarray(offset, end), end === bytes.length);
      await yieldToBrowser();
    }
  } catch {
    failure ??= new ImportError("corrupt", MESSAGES.corrupt);
  }
  if (failure) throw failure;
  return sources;
}

/**
 * Reads a Letterboxd data export (.zip) or a single exported CSV, entirely in
 * memory. Only the watchlist, the visitor's lists, liked films and watched films
 * are read; every other file is skipped without being inflated.
 */
export async function parseLetterboxdExport(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = DEFAULT_LIMITS,
): Promise<ImportResult> {
  if (bytes.length === 0) return fail("unrecognized");
  if (bytes.length > limits.maxFileBytes) return fail("too_large");
  const collector = new Collector(limits);
  if (isZip(bytes)) {
    for (const source of await readZip(bytes, limits)) collector.addSource(source);
  } else {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return fail("unrecognized");
    }
    collector.addSource({ ...classifyCsv(fileName), text });
  }
  return collector.result();
}
