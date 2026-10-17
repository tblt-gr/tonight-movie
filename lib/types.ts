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

export type Snapshot = {
  source: string;
  title: string;
  kind: "list" | "watchlist";
  updatedAt: string;
  providers: Record<string, Provider>;
  films: Film[];
};

export type ProfileEntry = {
  url: string;
  title: string;
  count: number | null;
  kind: "created" | "liked" | "watchlist";
};
export type Profile = {
  username: string;
  updatedAt: string;
  lists: ProfileEntry[];
  watchlist: ProfileEntry | null;
  unavailable: string[];
};
