export type StorageArea = "settings" | "library";

export const PERSISTENCE_NOTICE =
  "Le stockage du navigateur est indisponible : vos réglages et vos films ne seront pas conservés après la fermeture de la page.";

const failed = new Set<StorageArea>();
const listeners = new Set<() => void>();

/** Records that an area runs in memory only, so the UI can warn the visitor. */
export function markUnavailable(area: StorageArea) {
  if (failed.has(area)) return;
  failed.add(area);
  listeners.forEach((listener) => listener());
}

export function clearUnavailable() {
  if (failed.size === 0) return;
  failed.clear();
  listeners.forEach((listener) => listener());
}

/** Stable string or `null`, so it can feed `useSyncExternalStore` directly. */
export function getPersistenceNotice(): string | null {
  return failed.size > 0 ? PERSISTENCE_NOTICE : null;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
