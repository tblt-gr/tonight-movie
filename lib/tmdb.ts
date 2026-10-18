import { ApiFailure } from "@/lib/errors";
import type {
  DiscoverResponse,
  MovieDetails,
  MovieSummary,
  Offer,
  ProvidersResponse,
  SearchResponse,
} from "@/lib/types";
import { MAX_PAGE, type DiscoverSort } from "@/lib/validation";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_SITE = "https://www.themoviedb.org";
const TMDB_IMAGES = "https://image.tmdb.org/t/p/";
const LANGUAGE = "fr-FR";
const ENGLISH = "en-US";
const REGION = "FR";
const REVALIDATE_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 8_000;

const IMAGE_SIZES = { poster: "w342", logo: "w92" } as const;

const OFFER_TYPES = [
  ["flatrate", "FLATRATE"],
  ["free", "FREE"],
  ["ads", "ADS"],
  ["rent", "RENT"],
  ["buy", "BUY"],
] as const;

type TmdbMovie = {
  id?: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  adult?: boolean;
  overview?: string;
  runtime?: number | null;
  genres?: { name?: string }[];
  "watch/providers"?: { results?: Record<string, TmdbRegionProviders | undefined> };
};

type TmdbProvider = { provider_id?: number; provider_name?: string; logo_path?: string | null };

type TmdbRegionProviders = { link?: string } & Partial<
  Record<(typeof OFFER_TYPES)[number][0], TmdbProvider[]>
>;

type TmdbPage = { page?: number; total_pages?: number; results?: TmdbMovie[] };

export const MISSING_KEY_MESSAGE =
  "TMDB_API_KEY is not set on the server (a v4 read access token is required)";

/** A v4 read access token is a JWT: it travels in a header, so it never ends up in a cached URL. */
function readToken(): string | null {
  const token = process.env.TMDB_API_KEY?.trim();
  return token?.includes(".") ? token : null;
}

export function isTmdbConfigured(): boolean {
  return readToken() !== null;
}

export function imageUrl(path: string | null | undefined, kind: keyof typeof IMAGE_SIZES) {
  if (!path || !/^\/[\w.-]+$/.test(path)) return null;
  return `${TMDB_IMAGES}${IMAGE_SIZES[kind]}${path}`;
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
  { notFound = false }: { notFound?: boolean } = {},
): Promise<T> {
  const key = readToken();
  if (!key) throw new ApiFailure("not_configured", 503, MISSING_KEY_MESSAGE);

  const url = new URL(`${TMDB_API}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const headers = { Accept: "application/json", Authorization: `Bearer ${key}` };

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiFailure("upstream_timeout", 504, "The film service took too long to answer");
    }
    throw new ApiFailure("upstream_error", 502, "The film service is unreachable");
  }

  if (response.status === 404 && notFound) throw new ApiFailure("not_found", 404, "Film not found");
  if (!response.ok) {
    // Status and path only: the operator learns about a revoked token without a secret in the logs.
    console.error("TMDB responded", response.status, path);
    if (response.status === 429) {
      throw new ApiFailure(
        "upstream_error",
        503,
        "The film service is busy, try again shortly",
        30,
      );
    }
    throw new ApiFailure("upstream_error", 502, "The film service failed");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiFailure("upstream_error", 502, "The film service sent an unreadable answer");
  }
}

function summarize(movie: TmdbMovie): MovieSummary | null {
  if (typeof movie.id !== "number" || !movie.title) return null;
  const year = Number.parseInt(movie.release_date?.slice(0, 4) ?? "", 10);
  return {
    tmdbId: movie.id,
    title: movie.title,
    originalTitle: movie.original_title || null,
    year: Number.isFinite(year) ? year : null,
    poster: imageUrl(movie.poster_path, "poster"),
    rating: movie.vote_count && typeof movie.vote_average === "number" ? movie.vote_average : null,
  };
}

function summarizeAll(movies: TmdbMovie[] | undefined): MovieSummary[] {
  return (movies ?? []).flatMap((movie) => summarize(movie) ?? []);
}

/** Maps TMDB's French offers. Prime Video and each Prime Video Channel keep their own provider id. */
export function mapOffers(region: TmdbRegionProviders | undefined): Offer[] {
  if (!region) return [];
  const offers: Offer[] = [];
  for (const [tmdbType, type] of OFFER_TYPES) {
    for (const provider of region[tmdbType] ?? []) {
      if (typeof provider.provider_id !== "number" || !provider.provider_name) continue;
      offers.push({
        id: String(provider.provider_id),
        name: provider.provider_name,
        icon: imageUrl(provider.logo_path, "logo"),
        type,
        url: null,
      });
    }
  }
  return offers;
}

function tmdbPageUrl(link: string | undefined): string | null {
  try {
    return link && new URL(link).origin === TMDB_SITE ? link : null;
  } catch {
    return null;
  }
}

export function mapMovie(movie: TmdbMovie): MovieDetails | null {
  const summary = summarize(movie);
  if (!summary) return null;
  const region = movie["watch/providers"]?.results?.[REGION];
  const offers = mapOffers(region);
  return {
    ...summary,
    overview: movie.overview?.trim() || null,
    runtime: movie.runtime || null,
    genres: (movie.genres ?? []).flatMap((genre) => genre.name ?? []),
    offers,
    availabilityStatus: offers.length > 0 ? "verified" : "unknown",
    offersUrl: offers.length > 0 ? tmdbPageUrl(region?.link) : null,
  };
}

/**
 * Letterboxd names most foreign films by their English title, which TMDB's French
 * results do not carry. Both languages are searched and merged by film id.
 */
export async function searchMovies(title: string, year: number | null): Promise<SearchResponse> {
  const search = (language: string) =>
    tmdbGet<TmdbPage>("/search/movie", {
      query: title,
      language,
      include_adult: "false",
      page: "1",
      ...(year === null ? {} : { year: String(year) }),
    });
  const [french, english] = await Promise.all([
    search(LANGUAGE),
    search(ENGLISH).catch(() => ({ results: [] }) as TmdbPage),
  ]);
  const englishTitles = new Map(
    (english.results ?? []).flatMap((movie) =>
      typeof movie.id === "number" && movie.title ? [[movie.id, movie.title] as const] : [],
    ),
  );
  const known = new Set<number>();
  const results = summarizeAll(french.results).map((movie) => {
    known.add(movie.tmdbId);
    return { ...movie, englishTitle: englishTitles.get(movie.tmdbId) ?? null };
  });
  for (const movie of summarizeAll(english.results)) {
    if (!known.has(movie.tmdbId)) {
      results.push({ ...movie, englishTitle: movie.title });
    }
  }
  return { results };
}

export async function getMovie(id: number): Promise<MovieDetails> {
  const movie = await tmdbGet<TmdbMovie>(
    `/movie/${id}`,
    { language: LANGUAGE, append_to_response: "watch/providers" },
    { notFound: true },
  );
  // include_adult only filters search and discover, not a direct lookup.
  if (movie.adult) throw new ApiFailure("not_found", 404, "Film not found");
  const details = mapMovie(movie);
  if (!details)
    throw new ApiFailure("upstream_error", 502, "The film service sent incomplete data");
  return details;
}

export async function getProviders(): Promise<ProvidersResponse> {
  const data = await tmdbGet<{
    results?: (TmdbProvider & { display_priorities?: Record<string, number> })[];
  }>("/watch/providers/movie", { language: LANGUAGE, watch_region: REGION });
  const providers = (data.results ?? [])
    .flatMap((provider) =>
      typeof provider.provider_id === "number" && provider.provider_name
        ? [
            {
              info: {
                id: String(provider.provider_id),
                name: provider.provider_name,
                logo: imageUrl(provider.logo_path, "logo"),
              },
              priority: provider.display_priorities?.[REGION] ?? Number.MAX_SAFE_INTEGER,
            },
          ]
        : [],
    )
    .sort((a, b) => a.priority - b.priority || a.info.name.localeCompare(b.info.name, "fr"));
  return { providers: providers.map(({ info }) => info) };
}

const DISCOVER_ORDER: Record<DiscoverSort, Record<string, string>> = {
  popularity: { sort_by: "popularity.desc" },
  // Without a vote floor, films with one perfect vote would top the list.
  rating: { sort_by: "vote_average.desc", "vote_count.gte": "300" },
  year: { sort_by: "primary_release_date.desc" },
};

export async function discoverMovies(
  providers: number[],
  maxRuntime: number | null,
  page: number,
  sort: DiscoverSort = "popularity",
): Promise<DiscoverResponse> {
  const data = await tmdbGet<TmdbPage>("/discover/movie", {
    language: LANGUAGE,
    watch_region: REGION,
    with_watch_providers: providers.join("|"),
    with_watch_monetization_types: "flatrate|free|ads",
    include_adult: "false",
    ...DISCOVER_ORDER[sort],
    page: String(page),
    ...(maxRuntime === null ? {} : { "with_runtime.lte": String(maxRuntime) }),
  });
  return {
    page: data.page ?? page,
    totalPages: Math.min(data.total_pages ?? 0, MAX_PAGE),
    results: summarizeAll(data.results),
  };
}
