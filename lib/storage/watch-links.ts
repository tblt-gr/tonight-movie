import { DEFAULT_REGION } from "@/lib/regions";

const WATCH_LINKS_KEY = "tonight-movie:watch-links";
// Watchmode's free plan asks for cached data to be refreshed within 30 days.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILMS = 200;

type Links = Readonly<Record<string, string>>;
type Entry = { at: number; links: Links };

function read(): Record<string, Entry> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(WATCH_LINKS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, Entry>)
      : {};
  } catch {
    return {};
  }
}

/** France keeps the bare film id, so links remembered before the country existed stay valid. */
const entryKey = (tmdbId: number, region: string) =>
  region === DEFAULT_REGION ? String(tmdbId) : `${region}:${tmdbId}`;

/** The remembered direct links of a film, or `null` once missing or older than a week. */
export function loadWatchLinks(
  tmdbId: number,
  now = Date.now(),
  region = DEFAULT_REGION,
): Links | null {
  const entry = read()[entryKey(tmdbId, region)];
  const links = entry?.links;
  if (!entry || typeof entry.at !== "number" || now - entry.at > TTL_MS) return null;
  if (!links || typeof links !== "object" || Array.isArray(links)) return null;
  return Object.fromEntries(
    Object.entries(links).filter(([, url]) => typeof url === "string" && url.startsWith("https:")),
  );
}

/** Remembers a film's direct links, an empty list included, so the lookup is not repeated. */
export function saveWatchLinks(
  tmdbId: number,
  links: Links,
  now = Date.now(),
  region = DEFAULT_REGION,
) {
  const all: Record<string, Entry> = {
    ...read(),
    [entryKey(tmdbId, region)]: { at: now, links },
  };
  const entries = Object.entries(all)
    .filter(([, entry]) => typeof entry?.at === "number" && now - entry.at <= TTL_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_FILMS);
  try {
    window.localStorage.setItem(WATCH_LINKS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A cache: when the browser refuses the write, the next lookup simply asks again.
  }
}

export function clearWatchLinks() {
  try {
    window.localStorage.removeItem(WATCH_LINKS_KEY);
  } catch {
    // Nothing stored that could be erased.
  }
}
