import { DEFAULT_REGION } from "@/lib/regions";

const WATCHMODE_API = "https://api.watchmode.com/v1";
const TIMEOUT_MS = 5_000;
// Free-plan terms: cached data must be refreshed within 30 days.
const REVALIDATE_SECONDS = 7 * 24 * 60 * 60;

/** Watchmode has its own source ids, so a link is matched to TMDB providers by its host. */
const HOST_PROVIDERS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["netflix.com", ["8", "1796"]],
  ["primevideo.com", ["119"]],
  ["amazon.fr", ["10"]],
  ["tv.apple.com", ["350", "2"]],
  ["disneyplus.com", ["337"]],
  ["crunchyroll.com", ["283"]],
  ["canalplus.com", ["381"]],
  ["arte.tv", ["234"]],
  ["youtube.com", ["192", "188"]],
  ["mubi.com", ["11"]],
];

type WatchmodeSource = { type?: string; web_url?: string | null };

function providersOf(host: string): readonly string[] {
  for (const [suffix, ids] of HOST_PROVIDERS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return ids;
  }
  return [];
}

/** Direct links by TMDB provider id. Subscription and free sources win over rent and buy. */
export function mapWatchLinks(sources: WatchmodeSource[]): Record<string, string> {
  const links: Record<string, string> = {};
  const streaming = (source: WatchmodeSource) => source.type === "sub" || source.type === "free";
  const ordered = [...sources].sort((a, b) => Number(streaming(b)) - Number(streaming(a)));
  for (const source of ordered) {
    let url: URL;
    try {
      url = new URL(source.web_url ?? "");
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    for (const id of providersOf(url.hostname)) links[id] ??= url.href;
  }
  return links;
}

/**
 * Direct links to a film on its streaming services in France. Best effort: without a key,
 * past the monthly quota or on any failure the result is `null` and the caller falls back.
 * An empty object means Watchmode answered and knows no link for the film.
 */
export async function getWatchLinks(
  tmdbId: number,
  region = DEFAULT_REGION,
): Promise<Record<string, string> | null> {
  const key = process.env.WATCHMODE_API_KEY?.trim();
  if (!key) return null;
  const url = new URL(`${WATCHMODE_API}/title/movie-${tmdbId}/sources/`);
  url.searchParams.set("regions", region);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-API-Key": key },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      // Status only: the URL and headers could carry the key.
      console.error("Watchmode responded", response.status);
      return null;
    }
    const body: unknown = await response.json();
    return Array.isArray(body) ? mapWatchLinks(body as WatchmodeSource[]) : null;
  } catch {
    return null;
  }
}
