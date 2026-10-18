import type { Dictionary } from "@/lib/i18n";
import type { Film, Offer, Provider } from "@/lib/types";

export const STREAM_TYPES = new Set(["FLATRATE", "FREE", "ADS"]);
export const RENT_TYPES = new Set(["RENT", "BUY"]);
const PHYSICAL_ONLY = new Set(["fnac", "eleclerc"]);

export const PRESETS = [
  {
    id: "prime",
    name: "Prime Video",
    note: "Abonnement Prime",
    iconId: "amazonprimevideo",
    match: (id: string) =>
      /^(amazonprimevideo|amazonprimevideowithads|amazonprime|primevideo)$/.test(id),
  },
  {
    id: "max-prime",
    name: "Max via Prime",
    note: "Chaîne Prime Video",
    iconId: "amazonhbomax",
    match: (id: string) => id === "amazonhbomax",
  },
  {
    id: "m6",
    name: "M6+",
    note: "Service M6+ direct",
    iconId: "sixplay",
    match: (id: string) => /^(sixplay|m6plus)$/.test(id),
  },
  {
    id: "france-prime",
    name: "France.tv via Prime",
    note: "Chaîne Prime Video",
    iconId: "amazonfrancetv",
    match: (id: string) => id === "amazonfrancetv",
  },
];

export const DEFAULT_OWNED = PRESETS.map((item) => item.id);
export const GENRE_NAMES: Record<string, string> = {
  Action: "Action",
  Adventure: "Aventure",
  Animation: "Animation",
  Comedy: "Comédie",
  Crime: "Crime",
  Documentary: "Documentaire",
  Drama: "Drame",
  Family: "Famille",
  Fantasy: "Fantastique",
  History: "Histoire",
  Horror: "Horreur",
  Music: "Musique",
  Mystery: "Mystère",
  Romance: "Romance",
  "Science Fiction": "Science-fiction",
  Thriller: "Thriller",
  War: "Guerre",
  Western: "Western",
};

export type Category = "all" | "mine" | "other" | "none" | "unknown";
export type Sort =
  | "rank"
  | "rating-desc"
  | "rating-asc"
  | "runtime-asc"
  | "runtime-desc"
  | "platform"
  | "title"
  | "year-desc"
  | "year-asc";
export const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function isOwned(id: string, owned: Set<string>): boolean {
  return owned.has(id) || PRESETS.some((preset) => owned.has(preset.id) && preset.match(id));
}

export function relevantOffers(film: Film, includeRental: boolean, owned: Set<string>): Offer[] {
  const distinct = new Map<string, Offer>();
  for (const offer of film.offers || []) {
    if (
      !STREAM_TYPES.has(offer.type) &&
      !(includeRental && RENT_TYPES.has(offer.type) && !PHYSICAL_ONLY.has(offer.id))
    )
      continue;
    const key = `${offer.id}:${STREAM_TYPES.has(offer.type) ? "stream" : "rental"}`;
    if (!distinct.has(key)) distinct.set(key, offer);
  }
  return [...distinct.values()].sort((a, b) => {
    const score = (offer: Offer) =>
      STREAM_TYPES.has(offer.type) && isOwned(offer.id, owned)
        ? 0
        : RENT_TYPES.has(offer.type)
          ? 2
          : 1;
    return score(a) - score(b) || collator.compare(a.name, b.name);
  });
}

export function categoryOf(film: Film, includeRental: boolean, owned: Set<string>): Category {
  if (film.availabilityStatus === "unknown" || film.justwatchId === null) return "unknown";
  const offers = relevantOffers(film, includeRental, owned);
  if (offers.some((offer) => STREAM_TYPES.has(offer.type) && isOwned(offer.id, owned)))
    return "mine";
  return offers.length ? "other" : "none";
}

export function categoryText(category: Category): string {
  return {
    all: "Tous les films",
    mine: "Sur mes plateformes",
    other: "Sur une autre plateforme",
    none: "Indisponible en streaming",
    unknown: "Disponibilité à vérifier",
  }[category];
}

export function providerMap(
  films: Film[],
  registry: Record<string, Provider>,
): Record<string, Provider> {
  const result = { ...registry };
  for (const film of films)
    for (const offer of film.offers || [])
      result[offer.id] ||= { name: offer.name, icon: offer.icon };
  return result;
}

export function formatMinutes(value: number | null, t: Dictionary): string {
  return value && value > 0 ? t.format.runtime(value) : t.format.runtimeUnknown;
}

export function formatRating(value: number | null, t: Dictionary): string {
  return value === null
    ? t.format.ratingUnknown
    : `${value.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`;
}

export function sortFilms(
  films: Film[],
  sort: Sort,
  includeRental: boolean,
  owned: Set<string>,
): Film[] {
  const [field, direction] = sort.split("-");
  const sign = direction === "desc" ? -1 : 1;
  return [...films].sort((a, b) => {
    if (field === "title") return collator.compare(a.title, b.title) || a.rank - b.rank;
    if (field === "platform")
      return (
        collator.compare(
          relevantOffers(a, includeRental, owned)[0]?.name || "\uffff",
          relevantOffers(b, includeRental, owned)[0]?.name || "\uffff",
        ) || a.rank - b.rank
      );
    if (["runtime", "rating", "year"].includes(field)) {
      const x = a[field as "runtime" | "rating" | "year"],
        y = b[field as "runtime" | "rating" | "year"];
      if (x == null) return y == null ? a.rank - b.rank : 1;
      if (y == null) return -1;
      return (x - y) * sign || a.rank - b.rank;
    }
    return a.rank - b.rank;
  });
}

export type ServiceAvailability = "available" | "unavailable" | "unknown";

/**
 * Whether a film streams (`FLATRATE`, `FREE`, `ADS`) on one of the TMDB provider ids.
 * Rent and buy never count. A film without offer data is `unknown`, which is À vérifier
 * and not proof that it is unavailable.
 */
export function availabilityOn(
  film: { offers: Offer[]; availabilityStatus: "verified" | "unknown" },
  services: ReadonlySet<string>,
): ServiceAvailability {
  if (film.availabilityStatus === "unknown") return "unknown";
  return film.offers.some((offer) => STREAM_TYPES.has(offer.type) && services.has(offer.id))
    ? "available"
    : "unavailable";
}
