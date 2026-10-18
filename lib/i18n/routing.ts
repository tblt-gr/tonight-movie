import {
  FOLDERS,
  ROUTES,
  hasLocale,
  localizedPath,
  slugOf,
  type Locale,
  type RouteKey,
} from "@/lib/i18n/config";

export type RoutingDecision = { action: "rewrite" | "redirect"; to: string };

const withFolder = (lang: Locale, route: RouteKey) =>
  `/${lang}${FOLDERS[route] ? `/${FOLDERS[route]}` : ""}`;

/**
 * What the proxy does with a public path. Pages exist once, under `app/[lang]/<french folder>`:
 * French is served without a prefix by rewriting onto `/fr/...`, and every other language
 * rewrites its translated segment onto the same folder. A path in the wrong language, or an
 * explicit `/fr`, redirects to the canonical URL. `null` leaves the request alone.
 */
export function decideRouting(pathname: string): RoutingDecision | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const [first = "", second, ...rest] = clean.split("/").slice(1);

  if (first === "fr") {
    const tail = [second, ...rest].filter(Boolean).join("/");
    return { action: "redirect", to: tail ? `/${tail}` : "/" };
  }

  if (hasLocale(first)) {
    if (second === undefined || rest.length > 0) return null;
    const own = ROUTES.find((route) => route !== "home" && slugOf(first, route) === second);
    if (own) {
      return FOLDERS[own] === second ? null : { action: "rewrite", to: withFolder(first, own) };
    }
    const foreign = ROUTES.find((route) => route !== "home" && FOLDERS[route] === second);
    return foreign ? { action: "redirect", to: localizedPath(first, foreign) } : null;
  }

  if (clean === "/") return { action: "rewrite", to: "/fr" };
  if (rest.length > 0 || second !== undefined) return null;
  const route = ROUTES.find(
    (candidate) => candidate !== "home" && slugOf("fr", candidate) === first,
  );
  return route ? { action: "rewrite", to: withFolder("fr", route) } : null;
}
