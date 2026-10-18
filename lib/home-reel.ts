import type { MovieSummary } from "./types";

export const REEL_PROVIDERS = [
  { id: 8, name: "Netflix" },
  { id: 119, name: "Prime Video" },
  { id: 337, name: "Disney+" },
] as const;

export type ReelFilm = MovieSummary & { poster: string; provider: string; providerId: number };

/**
 * One film per provider: its most popular one with a poster that no earlier provider
 * already took. A provider with nothing left to show is skipped.
 */
export function pickReel(popular: readonly (readonly MovieSummary[])[]): ReelFilm[] {
  const taken = new Set<number>();
  const reel: ReelFilm[] = [];
  popular.forEach((films, index) => {
    const film = films.find((candidate) => candidate.poster && !taken.has(candidate.tmdbId));
    if (!film?.poster) return;
    taken.add(film.tmdbId);
    reel.push({
      ...film,
      poster: film.poster,
      provider: REEL_PROVIDERS[index].name,
      providerId: REEL_PROVIDERS[index].id,
    });
  });
  return reel;
}
