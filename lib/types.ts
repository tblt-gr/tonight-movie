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
