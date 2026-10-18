"use client";

import { useEffect, useState } from "react";
import { loadWatchLinks, saveWatchLinks } from "@/lib/storage/watch-links";

type Links = Readonly<Record<string, string>>;

// One request per film and page load: each lookup costs Watchmode credits.
const requested = new Map<number, Promise<Links>>();

function fetchLinks(tmdbId: number): Promise<Links> {
  const stored = loadWatchLinks(tmdbId);
  if (stored) return Promise.resolve(stored);
  let request = requested.get(tmdbId);
  if (!request) {
    request = fetch(`/api/watch-links/${tmdbId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { links?: Links; resolved?: boolean } | null) => {
        const links = data?.links ?? {};
        // An unresolved answer (no key, quota, outage) is not remembered, so a later visit retries.
        if (data?.resolved) saveWatchLinks(tmdbId, links);
        else requested.delete(tmdbId);
        return links;
      })
      .catch(() => {
        requested.delete(tmdbId);
        return {};
      });
    requested.set(tmdbId, request);
  }
  return request;
}

/**
 * Direct links to the streaming services by provider id, looked up only while `enabled`:
 * empty until loaded, and when no link is available.
 */
export function useWatchLinks(tmdbId: number, enabled: boolean): Links {
  const [loaded, setLoaded] = useState<{ tmdbId: number; links: Links } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchLinks(tmdbId).then((links) => alive && setLoaded({ tmdbId, links }));
    return () => {
      alive = false;
    };
  }, [tmdbId, enabled]);
  return enabled && loaded?.tmdbId === tmdbId ? loaded.links : {};
}
