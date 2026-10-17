export type OfferType = "FLATRATE" | "FREE" | "ADS" | "RENT" | "BUY" | string;

export type Offer = {
  id: string;
  name: string;
  icon: string | null;
  type: OfferType;
  url: string | null;
};

export type Film = {
  rank: number;
  title: string;
  year: number | null;
  letterboxdUrl: string;
  runtime: number | null;
  rating: number | null;
  genres: string[];
  tmdbId: number | null;
  justwatchId: string | null;
  justwatchUrl: string | null;
  poster: string | null;
  offers: Offer[];
  matchScore: number;
  availabilityStatus: "verified" | "unknown";
};

export type Provider = { name: string; icon: string | null };

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "not_configured"
  | "upstream_error"
  | "upstream_timeout"
  | "internal";

export type ApiError = { error: { code: ApiErrorCode; message: string } };

export type MovieSummary = {
  tmdbId: number;
  title: string;
  year: number | null;
  poster: string | null;
  /** TMDB average on a 0–10 scale, `null` while the film has no votes. */
  rating: number | null;
};

export type MovieDetails = MovieSummary & {
  overview: string | null;
  runtime: number | null;
  genres: string[];
  offers: Offer[];
  /** `unknown` renders as À vérifier: TMDB has no usable French offer data. */
  availabilityStatus: "verified" | "unknown";
  /** TMDB page crediting JustWatch, where the visitor can open the offers. */
  offersUrl: string | null;
};

export type SearchResponse = { results: MovieSummary[] };

export type ProviderInfo = { id: string; name: string; logo: string | null };

export type ProvidersResponse = { providers: ProviderInfo[] };

export type DiscoverResponse = {
  page: number;
  totalPages: number;
  results: MovieSummary[];
};
