const SEARCH: Record<string, string> = {
  "8": "https://www.netflix.com/search?q=",
  "1796": "https://www.netflix.com/search?q=",
  "119": "https://www.primevideo.com/search?phrase=",
  "10": "https://www.amazon.fr/s?k=",
  "350": "https://tv.apple.com/fr/search?term=",
  "2": "https://tv.apple.com/fr/search?term=",
  "337": "https://www.disneyplus.com/fr-fr/search?q=",
  "283": "https://www.crunchyroll.com/fr/search?q=",
  "381": "https://www.canalplus.com/recherche/?q=",
  "234": "https://www.arte.tv/fr/search/?q=",
  "192": "https://www.youtube.com/results?search_query=",
  "188": "https://www.youtube.com/results?search_query=",
  "11": "https://mubi.com/fr/search/films?query=",
};

/**
 * The provider's own search page for a film, by TMDB provider id. TMDB gives no deep link
 * to a title, so this lands on the platform with the title searched. `null` for a provider
 * without a known public search page.
 */
export function providerSearchUrl(providerId: string, title: string): string | null {
  const base = SEARCH[providerId];
  return base ? `${base}${encodeURIComponent(title)}` : null;
}
