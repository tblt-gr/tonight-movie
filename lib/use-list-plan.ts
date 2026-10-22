"use client";

import { useEffect, useState } from "react";
import {
  LOOKUP_BATCH,
  planListPage,
  type BrowseFilters,
  type DetailState,
  type ListPlan,
} from "@/lib/browse";
import { fetchDetails, mapLimit } from "@/lib/browse-client";
import type { Locale } from "@/lib/i18n/config";
import { fetchSearch, resolveFilms } from "@/lib/resolve";
import { library } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";

const EMPTY_PLAN: ListPlan = { shown: [], pending: [], done: false, exhausted: false };

type Input = {
  enabled: boolean;
  listFilms: StoredFilm[];
  filters: BrowseFilters;
  services: ReadonlySet<string>;
  limit: number;
  lang: Locale;
  /** Details looked up so far, a mutable cache owned by the caller so both sources share one cache. */
  details: Map<number, DetailState>;
  /** Film keys whose search failed, so they are not searched again until a reset. */
  failedKeys: Set<string>;
};

/** Imported lists: match and look up only the films a page needs, a batch at a time. */
export function useListPlan({
  enabled,
  listFilms,
  filters,
  services,
  limit,
  lang,
  details,
  failedKeys,
}: Input) {
  const [plan, setPlan] = useState<ListPlan>(EMPTY_PLAN);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let current = listFilms;
      for (;;) {
        const judged = current.map((film) =>
          failedKeys.has(film.key) ? { ...film, confidence: 0 } : film,
        );
        const next = planListPage(judged, details, filters, services, limit, LOOKUP_BATCH);
        if (signal.aborted) return;
        setPlan(next);
        if (next.pending.length === 0) {
          setBusy(false);
          return;
        }
        setBusy(true);

        const unresolved = next.pending.filter((film) => film.confidence === null);
        if (unresolved.length > 0) {
          await resolveFilms(
            unresolved.map((film) => film.key),
            library,
            fetchSearch(signal),
            { concurrency: 3, retries: 3, baseDelayMs: 1500, signal },
          );
          if (signal.aborted) return;
          const fresh = new Map((await library.getFilms()).map((film) => [film.key, film]));
          current = current.map((film) => fresh.get(film.key) ?? film);
          for (const { key } of unresolved) {
            if (fresh.get(key)?.confidence == null) failedKeys.add(key);
          }
        }

        const pendingKeys = new Set(next.pending.map((film) => film.key));
        const wanted = current.filter(
          (film) =>
            pendingKeys.has(film.key) &&
            film.confidence === 1 &&
            film.tmdbId !== null &&
            !details.has(film.tmdbId),
        );
        await mapLimit(
          wanted,
          4,
          async (film) => {
            const tmdbId = film.tmdbId!;
            try {
              details.set(tmdbId, await fetchDetails(tmdbId, signal, lang));
            } catch {
              if (!signal.aborted) details.set(tmdbId, "failed");
            }
          },
          signal,
        );
      }
    })();
    return () => controller.abort();
  }, [enabled, listFilms, filters, services, limit, lang, details, failedKeys]);

  return { plan, busy };
}
