import { tmdbClient } from "@/lib/tmdb-client";
import { createBackup, parseBackup, type Backup } from "@/lib/storage/backup";
import { library } from "@/lib/storage/library";
import { loadSettings, resetSettings, saveSettings } from "@/lib/storage/settings";
import { clearUnavailable } from "@/lib/storage/status";
import { clearWatchLinks } from "@/lib/storage/watch-links";

const resetListeners = new Set<() => void>();

/** Lets a screen drop what it shows about data that `resetAll` is about to erase. */
export function onReset(listener: () => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

/** Wipes the settings and every imported film this app stored in the browser. */
export async function resetAll() {
  resetSettings();
  await Promise.all([library.reset(), tmdbClient.clear()]);
  clearUnavailable();
  clearWatchLinks();
  resetListeners.forEach((listener) => listener());
}

/** The settings, films and lists as a backup the visitor can keep or move to another browser. */
export async function exportData(): Promise<Backup> {
  const [films, lists] = await Promise.all([library.getFilms(), library.getLists()]);
  return createBackup(loadSettings(), films, lists);
}

/**
 * Replaces the settings and the library with the content of a backup file. The file is checked
 * whole before anything is written, so a refused file leaves the current data untouched.
 */
export async function importData(text: string): Promise<void> {
  const backup = parseBackup(text);
  await library.replaceAll(backup.films, backup.lists);
  saveSettings(backup.settings);
  clearWatchLinks();
  resetListeners.forEach((listener) => listener());
}
