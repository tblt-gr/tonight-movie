export const PUBLIC_CACHE_DB = "tonight-movie:public-cache";
const STORE = "responses";
const MAX_ENTRIES = 2000;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export type CacheEntry = { key: string; at: number; data: unknown };

/** Disposable public data, kept separately from the visitor’s imported library. */
export function createPublicCache(
  factory: () => IDBFactory | undefined = () => globalThis.indexedDB,
) {
  const memory = new Map<string, CacheEntry>();
  let connection: Promise<IDBDatabase> | undefined;
  let generation = 0;
  let writes = 0;

  function open() {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const provider = factory();
      if (!provider) return reject(new Error("IndexedDB unavailable"));
      const request = provider.open(PUBLIC_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Cache upgrade blocked"));
    });
    return connection;
  }

  function remember(entry: CacheEntry) {
    memory.delete(entry.key);
    memory.set(entry.key, entry);
    if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  }

  return {
    peek(key: string) {
      return memory.get(key);
    },
    async read(key: string): Promise<CacheEntry | undefined> {
      const cached = memory.get(key);
      if (cached) return cached;
      const started = generation;
      try {
        const db = await open();
        const entry = await new Promise<CacheEntry | undefined>((resolve, reject) => {
          const request = db.transaction(STORE).objectStore(STORE).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (
          started !== generation ||
          !entry ||
          entry.key !== key ||
          !Number.isFinite(entry.at) ||
          entry.at > Date.now() ||
          Date.now() - entry.at > MAX_AGE
        )
          return;
        remember(entry);
        return entry;
      } catch {
        // Caching is optional: private browsing and quota failures must not block a film.
        return undefined;
      }
    },
    async write(entry: CacheEntry) {
      const started = generation;
      remember(entry);
      try {
        const db = await open();
        if (started !== generation) return;
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE, "readwrite");
          const store = transaction.objectStore(STORE);
          store.put(entry);
          // Prune in batches rather than reading the entire cache for every film.
          if (writes++ % 50 === 0) {
            const count = store.count();
            count.onsuccess = () => {
              let excess = Math.max(0, count.result - MAX_ENTRIES);
              const cursor = store.index("at").openCursor();
              cursor.onsuccess = () => {
                const row = cursor.result;
                if (!row) return;
                if (excess > 0 || row.value.at < Date.now() - MAX_AGE) {
                  row.delete();
                  excess -= 1;
                  row.continue();
                }
              };
            };
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } catch {
        // The in-memory entry remains usable if the persistent cache cannot be written.
      }
    },
    async clear() {
      generation += 1;
      memory.clear();
      const pending = connection;
      connection = undefined;
      try {
        (await pending?.catch(() => undefined))?.close();
        const provider = factory();
        if (!provider) return;
        await new Promise<void>((resolve, reject) => {
          const request = provider.deleteDatabase(PUBLIC_CACHE_DB);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Cache deletion blocked"));
        });
      } catch {
        // This database contains only disposable public API responses.
      }
    },
  };
}

export const publicCache = createPublicCache();
