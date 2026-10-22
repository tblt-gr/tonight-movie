import {
  DB_NAME,
  DB_VERSION,
  FILMS_STORE,
  LISTS_STORE,
  parseFilm,
  parseList,
  type StoredFilm,
  type StoredList,
} from "@/lib/storage/schema";
import { markUnavailable } from "@/lib/storage/status";

type Snapshot = { films: Map<string, StoredFilm>; lists: Map<string, StoredList> };

/** Fields a caller may set; membership, seen and resolved ids merge into the stored record. */
export type FilmInput = Omit<StoredFilm, "lists"> & { lists?: string[] };

/** Upgrade steps keyed by the version they upgrade from. */
type Upgrade = (db: IDBDatabase) => void;

export const UPGRADES: Record<number, Upgrade> = {
  0: (db) => {
    db.createObjectStore(FILMS_STORE, { keyPath: "key" });
    db.createObjectStore(LISTS_STORE, { keyPath: "id" });
  },
};

export function upgradeDatabase(db: IDBDatabase, from: number, to: number) {
  for (let version = from; version < to; version += 1) UPGRADES[version]?.(db);
}

const emptySnapshot = (): Snapshot => ({ films: new Map(), lists: new Map() });

const settled = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function mergeFilm(existing: StoredFilm | undefined, input: FilmInput): StoredFilm {
  const lists = [...new Set([...(existing?.lists ?? []), ...(input.lists ?? [])])];
  if (!existing) return { ...input, lists };
  const sure = existing.tmdbId !== null && (existing.confidence ?? 0) >= 1;
  return {
    key: existing.key,
    title: input.title,
    year: input.year ?? existing.year,
    // A sure match outlives a re-import, which keeps differential syncs cheap; a weak one is
    // replaced so that a better search can correct it.
    tmdbId: sure ? existing.tmdbId : input.tmdbId,
    confidence: sure ? existing.confidence : input.confidence,
    lists,
    // A film already seen stays seen: a plain list import carries no diary data.
    seen: existing.seen || input.seen,
    // A plain import carries no choice about ignoring, so the visitor's choice stays.
    ignored: input.ignored ?? existing.ignored,
  };
}

const sameFilm = (a: StoredFilm, b: StoredFilm) =>
  a.title === b.title &&
  a.year === b.year &&
  a.tmdbId === b.tmdbId &&
  a.confidence === b.confidence &&
  a.seen === b.seen &&
  !!a.ignored === !!b.ignored &&
  a.lists.length === b.lists.length &&
  a.lists.every((list, index) => list === b.lists[index]);

export function createLibrary(
  getFactory: () => IDBFactory | undefined = () => globalThis.indexedDB,
) {
  let connection: Promise<IDBDatabase> | null = null;
  /** Set once IndexedDB failed; every later call stays in memory. */
  let memory: Snapshot | null = null;

  function open(): Promise<IDBDatabase> {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = getFactory();
      if (!factory) return reject(new Error("IndexedDB is unavailable"));
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) =>
        upgradeDatabase(request.result, event.oldVersion, event.newVersion ?? DB_VERSION);
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
    });
    return connection;
  }

  async function readAll(): Promise<Snapshot> {
    const db = await open();
    const transaction = db.transaction([FILMS_STORE, LISTS_STORE], "readonly");
    const [films, lists] = await Promise.all([
      settled(transaction.objectStore(FILMS_STORE).getAll()),
      settled(transaction.objectStore(LISTS_STORE).getAll()),
    ]);
    const snapshot = emptySnapshot();
    for (const value of films) {
      const film = parseFilm(value);
      if (film) snapshot.films.set(film.key, film);
    }
    for (const value of lists) {
      const list = parseList(value);
      if (list) snapshot.lists.set(list.id, list);
    }
    return snapshot;
  }

  async function writeAll(films: StoredFilm[], lists: StoredList[]) {
    const db = await open();
    const transaction = db.transaction([FILMS_STORE, LISTS_STORE], "readwrite");
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const filmStore = transaction.objectStore(FILMS_STORE);
    const listStore = transaction.objectStore(LISTS_STORE);
    films.forEach((film) => filmStore.put(film));
    lists.forEach((list) => listStore.put(list));
    await done;
  }

  /** Switches to memory, keeping whatever IndexedDB could still read. */
  async function degrade(): Promise<Snapshot> {
    markUnavailable("library");
    memory ??= await readAll().catch(emptySnapshot);
    return memory;
  }

  async function load(): Promise<Snapshot> {
    if (memory) return memory;
    try {
      return await readAll();
    } catch {
      return degrade();
    }
  }

  async function save(films: StoredFilm[], lists: StoredList[]) {
    if (!memory) {
      try {
        await writeAll(films, lists);
        return;
      } catch {
        await degrade();
      }
    }
    for (const film of films) memory!.films.set(film.key, film);
    for (const list of lists) memory!.lists.set(list.id, list);
  }

  return {
    async getFilms(): Promise<StoredFilm[]> {
      return [...(await load()).films.values()];
    },

    async getLists(): Promise<StoredList[]> {
      return [...(await load()).lists.values()];
    },

    /** Merges `inputs` into the store and only writes the records that changed. */
    async upsertFilms(inputs: FilmInput[]) {
      const { films } = await load();
      const changed = new Map<string, StoredFilm>();
      for (const input of inputs) {
        const existing = changed.get(input.key) ?? films.get(input.key);
        const merged = parseFilm(mergeFilm(existing, input));
        if (!merged || (existing && sameFilm(existing, merged))) continue;
        changed.set(merged.key, merged);
      }
      if (changed.size > 0) await save([...changed.values()], []);
    },

    async upsertList(list: StoredList) {
      const clean = parseList(list);
      if (!clean) return;
      const existing = (await load()).lists.get(clean.id);
      if (existing && existing.name === clean.name && existing.importedAt === clean.importedAt)
        return;
      await save([], [clean]);
    },

    /** Deletes the database and forgets the in-memory copy. */
    async reset() {
      memory = null;
      const pending = connection;
      connection = null;
      try {
        (await pending?.catch(() => null))?.close();
        const factory = getFactory();
        if (factory) await settled(factory.deleteDatabase(DB_NAME));
      } catch {
        markUnavailable("library");
      }
    },
  };
}

export const library = createLibrary();
