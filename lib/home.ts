import { localizedPath, type Locale } from "@/lib/i18n/config";

/** Returns where the home page must send the visitor, or `null` to keep the presentation. */
export function homeRedirectTarget(services: readonly string[], search: string, lang: Locale) {
  if (new URLSearchParams(search).has("intro")) return null;
  return services.length > 0 ? localizedPath(lang, "draw") : null;
}
