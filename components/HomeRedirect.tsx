"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeRedirectTarget } from "@/lib/home";
import { loadSettings } from "@/lib/storage/settings";

/** Sends a returning visitor (at least one saved service) to the draw, unless `?intro` is set. */
export function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    const target = homeRedirectTarget(loadSettings().services, window.location.search);
    if (target) router.replace(target);
  }, [router]);
  return null;
}
