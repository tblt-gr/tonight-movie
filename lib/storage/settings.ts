import {
  DEFAULT_SETTINGS,
  RECENT_DRAWS_LIMIT,
  SETTINGS_KEY,
  SETTINGS_MIGRATIONS,
  SETTINGS_VERSION,
  migrate,
  parseSettings,
  type Settings,
} from "@/lib/storage/schema";
import { markUnavailable } from "@/lib/storage/status";

/** Holds the latest settings once `localStorage` has refused a write. */
let fallback: Settings | null = null;

function defaults(): Settings {
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings(): Settings {
  if (fallback) return fallback;
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return defaults();
    const envelope: unknown = JSON.parse(raw);
    if (typeof envelope !== "object" || envelope === null) return defaults();
    const { version, data } = envelope as { version?: unknown; data?: unknown };
    const migrated = migrate(data, version, SETTINGS_VERSION, SETTINGS_MIGRATIONS);
    return parseSettings(migrated) ?? defaults();
  } catch {
    markUnavailable("settings");
    return defaults();
  }
}

export function saveSettings(settings: Settings): Settings {
  const clean = parseSettings(settings) ?? defaults();
  if (typeof window === "undefined") return clean;
  try {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: SETTINGS_VERSION, data: clean }),
    );
    fallback = null;
  } catch {
    fallback = clean;
    markUnavailable("settings");
  }
  return clean;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  return saveSettings({ ...loadSettings(), ...patch });
}

/** Puts `key` first and keeps the last `RECENT_DRAWS_LIMIT` distinct draws. */
export function recordDraw(key: string): Settings {
  const { recentDraws } = loadSettings();
  const next = [key, ...recentDraws.filter((existing) => existing !== key)];
  return updateSettings({ recentDraws: next.slice(0, RECENT_DRAWS_LIMIT) });
}

export function resetSettings() {
  fallback = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
  } catch {
    markUnavailable("settings");
  }
}
