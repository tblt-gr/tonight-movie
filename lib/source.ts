import { load } from "cheerio";
import type { Film, Offer, Provider, Snapshot } from "./types";

export const DEFAULT_LIST_URL =
  "https://letterboxd.com/maurice_deni/list/top-250-imdb-x-top-100-nwt/";
const GRAPHQL = "https://apis.justwatch.com/graphql";
const SEARCH_QUERY = `query ($search: String!) {
  popularTitles(country: FR, first: 12, filter: {searchQuery: $search, objectTypes: [MOVIE]}) {
    edges { node { id content(country: FR, language: en) { title originalReleaseYear runtime posterUrl(profile: S166, format: JPG) fullPath }
      ... on Movie { offers(country: FR, platform: WEB, filter: {bestOnly: false}) {
        monetizationType standardWebURL package { clearName technicalName icon(profile: S100) }
      } } } }
  }
}`;
const PROVIDERS_QUERY = `query { packages(platform: WEB, country: FR) { technicalName clearName icon(profile: S100) } }`;

type JwNode = {
  id: string;
  content?: {
    title?: string;
    originalReleaseYear?: number;
    runtime?: number;
    posterUrl?: string;
    fullPath?: string;
  };
  offers?: Array<{
    monetizationType?: string;
    standardWebURL?: string;
    package?: { technicalName?: string; clearName?: string; icon?: string };
  }>;
};
type BareFilm = Pick<Film, "title" | "year" | "letterboxdUrl">;

export function canonicalListUrl(input: unknown): string {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error("Collez l'URL d'une liste ou watchlist Letterboxd.");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("URL Letterboxd invalide.");
  }
  if (
    url.protocol !== "https:" ||
    !["letterboxd.com", "www.letterboxd.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Seules les URL HTTPS Letterboxd sont acceptées.");
  }
  const match = decodeURIComponent(url.pathname).match(
    /^\/([A-Za-z0-9_-]+)\/(?:list\/([A-Za-z0-9_-]+)|watchlist)\/?(?:page\/\d+\/?)?$/,
  );
  if (!match) throw new Error("Utilisez une liste publique ou une watchlist publique Letterboxd.");
  return `https://letterboxd.com/${match[1]}/${match[2] ? `list/${match[2]}/` : "watchlist/"}`;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; personal-film-catalog/2.0)",
          "Accept-Language": "en-US,en;q=0.9",
          ...(init?.headers || {}),
        },
      });
      if (response.status === 403 || response.status === 404)
        throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      if (String(error).includes("HTTP 403") || String(error).includes("HTTP 404") || attempt === 2)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw new Error("Source inaccessible.");
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const body = await fetchText(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://www.justwatch.com" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = JSON.parse(body) as { data?: T; errors?: unknown[] };
  if (!payload.data) throw new Error("JustWatch ne répond pas.");
  return payload.data;
}

function iconUrl(path?: string): string | null {
  return path?.startsWith("/icon/")
    ? `https://images.justwatch.com${path.replace("{format}", "png")}`
    : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const x = normalize(a),
    y = normalize(b);
  if (x === y) return 1;
  if (!x || !y) return 0;
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++)
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(x[i - 1] !== y[j - 1]),
      );
    previous = current;
  }
  return 1 - previous[y.length] / Math.max(x.length, y.length);
}

function matchScore(film: BareFilm, node: JwNode): number {
  const year = node.content?.originalReleaseYear;
  const gap = film.year && year ? Math.abs(film.year - year) : 5;
  return (
    similarity(film.title, node.content?.title || "") +
    (gap === 0 ? 0.3 : gap === 1 ? 0.1 : -0.1 * Math.min(gap, 4))
  );
}

function parseFilmList(page: string): BareFilm[] {
  const $ = load(page);
  const seen = new Set<string>();
  const films: BareFilm[] = [];
  $('div[data-component-class="LazyPoster"][data-item-link^="/film/"]').each((_, element) => {
    const link = $(element).attr("data-item-link") || "";
    const display = $(element).attr("data-item-name") || "";
    if (!/^\/film\/[A-Za-z0-9_-]+\/$/.test(link) || !display || seen.has(link)) return;
    seen.add(link);
    const year = display.match(/\((\d{4})\)$/);
    films.push({
      title: display.replace(/ \(\d{4}\)$/, ""),
      year: year ? Number(year[1]) : null,
      letterboxdUrl: `https://letterboxd.com${link}`,
    });
  });
  return films;
}

export async function readList(url: string): Promise<{ title: string; films: BareFilm[] }> {
  let first: string;
  try {
    first = await fetchText(url);
  } catch (error) {
    if (/HTTP (403|404)/.test(String(error)))
      throw new Error("Liste introuvable, privée ou inaccessible depuis ce serveur.");
    throw error;
  }
  const $ = load(first);
  const films = parseFilmList(first);
  const path = new URL(url).pathname;
  const pages = [
    ...first.matchAll(
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "page/(\\d+)/", "g"),
    ),
  ].map((match) => Number(match[1]));
  const last = Math.max(1, ...pages);
  if (last > 100) throw new Error("Liste trop grande pour cette version de l'importeur.");
  const seen = new Set(films.map((film) => film.letterboxdUrl));
  for (let page = 2; page <= last; page++) {
    const items = parseFilmList(await fetchText(`${url}page/${page}/`));
    for (const item of items)
      if (!seen.has(item.letterboxdUrl)) {
        seen.add(item.letterboxdUrl);
        films.push(item);
      }
  }
  if (!films.length)
    throw new Error(
      "Aucun film trouvé dans cette liste. Elle est peut-être privée ou inaccessible.",
    );
  return { title: $("meta[property='og:title']").attr("content") || "Liste Letterboxd", films };
}

async function filmDetails(film: BareFilm): Promise<{
  rating: number | null;
  tmdbId: number | null;
  runtime: number | null;
  genres: string[];
}> {
  try {
    const page = await fetchText(film.letterboxdUrl);
    const rating = page.match(/"ratingValue"\s*:\s*([0-9.]+)/);
    const tmdb = page.match(/data-tmdb-id="(\d+)"/);
    const duration = page.match(/"duration":"PT(?:(\d+)H)?(?:(\d+)M)?/);
    const genres = page.match(/"genre":(\[[^\]]*\])/);
    return {
      rating: rating ? Number(rating[1]) : null,
      tmdbId: tmdb ? Number(tmdb[1]) : null,
      runtime: duration ? Number(duration[1] || 0) * 60 + Number(duration[2] || 0) : null,
      genres: genres ? (JSON.parse(genres[1]) as string[]) : [],
    };
  } catch {
    return { rating: null, tmdbId: null, runtime: null, genres: [] };
  }
}

async function justwatchData(film: BareFilm): Promise<{ node: JwNode | null; score: number }> {
  try {
    const search =
      film.title === "Kill Bill: The Whole Bloody Affair" ? "Whole Bloody Affair" : film.title;
    const data = await graphql<{ popularTitles: { edges: Array<{ node: JwNode }> } }>(
      SEARCH_QUERY,
      { search },
    );
    let nodes = data.popularTitles.edges.map((edge) => edge.node);
    if (film.title === "Kill Bill: The Whole Bloody Affair")
      nodes = nodes.filter((node) => node.id === "tm251129");
    if (film.title === "The Chaos Class Failed the Class") nodes = [];
    const ranked = nodes
      .map((node) => ({ node, score: matchScore(film, node) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.95) return { node: null, score: best?.score || 0 };
    return best;
  } catch {
    return { node: null, score: 0 };
  }
}

async function processFilm(film: BareFilm, rank: number, known?: Map<string, Film>): Promise<Film> {
  const reused = known?.get(film.letterboxdUrl);
  if (reused) return { ...reused, rank };
  const [details, search] = await Promise.all([filmDetails(film), justwatchData(film)]);
  const node = search.node;
  const content = node?.content || {};
  const offers = new Map<string, Offer>();
  for (const offer of node?.offers || []) {
    const provider = offer.package;
    if (!provider?.technicalName || !offer.monetizationType) continue;
    const id = provider.technicalName;
    const type = offer.monetizationType;
    const key = `${id}:${type}`;
    if (!offers.has(key))
      offers.set(key, {
        id,
        name: provider.clearName || id,
        icon: iconUrl(provider.icon),
        type,
        url: offer.standardWebURL || null,
      });
  }
  const poster = content.posterUrl
    ? `https://images.justwatch.com${content.posterUrl.replace("/s166/", "/s332/")}`
    : null;
  return {
    rank,
    ...film,
    runtime: details.runtime || content.runtime || null,
    rating: details.rating,
    genres: details.genres,
    tmdbId: details.tmdbId,
    justwatchId: node?.id || null,
    justwatchUrl: content.fullPath ? `https://www.justwatch.com${content.fullPath}` : null,
    poster:
      poster ||
      (film.title === "Harakiri"
        ? "https://media.themoviedb.org/t/p/w500/y1bgzJiMVTNY4RoNc29eCebio57.jpg"
        : null),
    offers: [...offers.values()],
    matchScore: Number(search.score.toFixed(3)),
    availabilityStatus: node ? "verified" : "unknown",
  };
}

async function loadProviders(): Promise<Record<string, Provider>> {
  const data = await graphql<{
    packages: Array<{ technicalName: string; clearName: string; icon?: string }>;
  }>(PROVIDERS_QUERY);
  return Object.fromEntries(
    data.packages
      .filter((item) => item.technicalName)
      .map((item) => [item.technicalName, { name: item.clearName, icon: iconUrl(item.icon) }]),
  );
}

export async function buildSnapshot(
  url: string,
  progress: (done: number, total: number) => void,
  known?: Map<string, Film>,
): Promise<Snapshot> {
  const { title, films: listed } = await readList(url);
  const films: Film[] = new Array(listed.length);
  let done = 0;
  progress(done, listed.length);
  for (let index = 0; index < listed.length; index += 4) {
    await Promise.all(
      listed.slice(index, index + 4).map(async (film, offset) => {
        films[index + offset] = await processFilm(film, index + offset + 1, known);
        progress(++done, listed.length);
      }),
    );
  }
  let providers: Record<string, Provider> = {};
  try {
    providers = await loadProviders();
  } catch {
    /* offer metadata still supplies available providers */
  }
  for (const film of films)
    for (const offer of film.offers) providers[offer.id] ||= { name: offer.name, icon: offer.icon };
  return {
    source: url,
    title,
    kind: url.includes("/watchlist/") ? "watchlist" : "list",
    updatedAt: new Date().toISOString(),
    providers,
    films,
  };
}
