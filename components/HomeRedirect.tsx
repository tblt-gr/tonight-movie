"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";
import { useI18n } from "@/components/I18nProvider";
import { homeRedirectTarget } from "@/lib/home";
import { SETTINGS_KEY } from "@/lib/storage/schema";
import { loadSettings } from "@/lib/storage/settings";

/** Set on `<html>` while the visitor is being sent away, so the presentation is never painted. */
const REDIRECT_ATTRIBUTE = "data-home-redirect";

/** Runs before first paint on a full page load, where the effect below comes too late. */
export const HIDE_BEFORE_PAINT = `try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).data;if(/^\\/(en)?\\/?$/.test(location.pathname)&&d.services.length&&!/[?&]intro(=|&|$)/.test(location.search))document.documentElement.setAttribute(${JSON.stringify(REDIRECT_ATTRIBUTE)},"")}catch(e){}`;

/** Sends a returning visitor (at least one saved service) to the draw, unless `?intro` is set. */
export function HomeRedirect() {
  const router = useRouter();
  const { lang } = useI18n();
  // Before paint, so a client-side navigation to `/` never shows the presentation.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const target = homeRedirectTarget(loadSettings().services, window.location.search, lang);
    if (!target) {
      root.removeAttribute(REDIRECT_ATTRIBUTE);
      return;
    }
    root.setAttribute(REDIRECT_ATTRIBUTE, "");
    router.replace(target);
    return () => root.removeAttribute(REDIRECT_ATTRIBUTE);
  }, [router, lang]);
  return null;
}
