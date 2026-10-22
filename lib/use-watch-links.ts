"use client";

import { useEffect, useState } from "react";
import { browserRegion, regionParam } from "@/lib/regions";
import { loadSettings } from "@/lib/storage/settings";
import { loadWatchLinks, saveWatchLinks } from "@/lib/storage/watch-links";

type Links = Readonly<Record<string, string>>;

// One request per film and page load: each lookup costs Watchmode credits.
const requested = new Map<string, Promise<Links>>();

function fetchLinks(tmdbId: number, region: string): Promise<Links> {
  const stored = loadWatchLinks(tmdbId, Date.now(), region);
  if (stored) return Promise.resolve(stored);
  const key = `${region}:${tmdbId}`;
  let request = requested.get(key);
  if (!request) {
    const query = regionParam(region);
    request = fetch(`/api/watch-links/${tmdbId}${query ? `?${query}` : ""}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { links?: Links; resolved?: boolean } | null) => {
        const links = data?.links ?? {};
        // An unresolved answer (no key, quota, outage) is not remembered, so a later visit retries.
        if (data?.resolved) saveWatchLinks(tmdbId, links, Date.now(), region);
        else requested.delete(key);
        return links;
      })
      .catch(() => {
        requested.delete(key);
        return {};
      });
    requested.set(key, request);
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
    const region = browserRegion(loadSettings().region);
    void fetchLinks(tmdbId, region).then((links) => alive && setLoaded({ tmdbId, links }));
    return () => {
      alive = false;
    };
  }, [tmdbId, enabled]);
  return enabled && loaded?.tmdbId === tmdbId ? loaded.links : {};
}
