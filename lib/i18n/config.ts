export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** French is served without a prefix; the other languages live under `/<locale>`. */
export const DEFAULT_LOCALE: Locale = "fr";

export const hasLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export const ROUTES = ["home", "draw", "films", "settings", "about"] as const;
export type RouteKey = (typeof ROUTES)[number];

/** The URL segment of each page, per language. `home` has no segment. */
const SLUGS: Record<RouteKey, Record<Locale, string>> = {
  home: { fr: "", en: "" },
  draw: { fr: "tirage", en: "draw" },
  films: { fr: "films", en: "films" },
  settings: { fr: "reglages", en: "settings" },
  about: { fr: "a-propos", en: "about" },
};

/**
 * The folder of each page under `app/[lang]`. Pages are written once, in French, and the
 * proxy rewrites the public URL of every language onto them.
 */
export const FOLDERS: Record<RouteKey, string> = {
  home: "",
  draw: "tirage",
  films: "films",
  settings: "reglages",
  about: "a-propos",
};

/** TMDB's name for each language, which also picks the language of titles and synopses. */
export const TMDB_LANGUAGE: Record<Locale, string> = { fr: "fr-FR", en: "en-US" };

export const OTHER_LOCALE: Record<Locale, Locale> = { fr: "en", en: "fr" };

/** The public path of a page: `/tirage` in French, `/en/draw` in English. */
export function localizedPath(lang: Locale, route: RouteKey): string {
  const slug = SLUGS[route][lang];
  const prefix = lang === DEFAULT_LOCALE ? "" : `/${lang}`;
  return `${prefix}/${slug}`.replace(/\/$/, "") || "/";
}

/** The page behind a public path in `lang`, or `null` when it is none of the known pages. */
export function routeOf(lang: Locale, pathname: string): RouteKey | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return ROUTES.find((route) => localizedPath(lang, route) === clean) ?? null;
}

/** The language a public path belongs to: a leading `/en` selects English, anything else French. */
export function localeOf(pathname: string): Locale {
  const first = pathname.split("/")[1] ?? "";
  return hasLocale(first) && first !== DEFAULT_LOCALE ? first : DEFAULT_LOCALE;
}

export function slugOf(lang: Locale, route: RouteKey): string {
  return SLUGS[route][lang];
}

/** The path of the same page in another language, or the home page when the page is unknown. */
export function switchLocalePath(from: Locale, to: Locale, pathname: string): string {
  const route = routeOf(from, pathname) ?? "home";
  return localizedPath(to, route);
}

/** `lang=en` for the app's own API routes; French is the default, so it adds nothing. */
export function langParam(lang: Locale): string {
  return lang === DEFAULT_LOCALE ? "" : `lang=${lang}`;
}
