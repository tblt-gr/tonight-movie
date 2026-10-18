"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { localizedPath, type Locale, type RouteKey } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type I18n = {
  lang: Locale;
  t: Dictionary;
  /** The public path of a page in the current language. */
  href: (route: RouteKey) => string;
};

const I18nContext = createContext<I18n | null>(null);

/**
 * Hands the language to client components. Only the language crosses the server boundary:
 * the dictionary holds functions, so each side loads it itself.
 */
export function I18nProvider({ lang, children }: { lang: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({ lang, t: getDictionary(lang), href: (route) => localizedPath(lang, route) }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n needs an I18nProvider");
  return value;
}
