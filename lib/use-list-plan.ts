"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LOOKUP_BATCH,
  planListPage,
  type BrowseFilters,
  type DetailState,
  type ListPlan,
} from "@/lib/browse";
import { cachedDetails, fetchDetails, mapLimit, readFreshDetails } from "@/lib/browse-client";
import type { Locale } from "@/lib/i18n/config";
import { factsOf } from "@/lib/enrich";
import { fetchSearch, resolveFilms } from "@/lib/resolve";
import { library } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";

const EMPTY_PLAN: ListPlan = {
  shown: [],
  pending: [],
  done: false,
  exhausted: false,
  judged: 0,
  total: 0,
  full: false,
};

type Input = {
  enabled: boolean;
  listFilms: StoredFilm[];
  filters: BrowseFilters;
  services: ReadonlySet<string>;
  limit: number;
  lang: Locale;
  region: string;
  /** Details looked up so far, a mutable cache owned by the caller so both sources share one cache. */
  details: Map<number, DetailState>;
  /** Film keys whose search failed, so they are not searched again until a reset. */
  failedKeys: Set<string>;
};

/** Publish each completed lookup batch without waiting for the whole source. */
export function useListPlan({
  enabled,
  listFilms,
  filters,
  services,
  limit,
  lang,
  region,
  details,
  failedKeys,
}: Input) {
  const request = useMemo(
    () => ({ listFilms, filters, services, lang, region }),
    [listFilms, filters, services, lang, region],
  );
  const [result, setResult] = useState({ request, limit: 0, plan: EMPTY_PLAN });

  useEffect(() => {
    if (!enabled) return;
    for (const id of details.keys()) {
      if (!cachedDetails(id, lang, region)) details.delete(id);
    }
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      // One read of the cache for the whole source, so filtering never waits on a film at a time.
      await Promise.all(
        listFilms.map(async ({ confidence, tmdbId }) => {
          if (confidence !== 1 || tmdbId === null || details.has(tmdbId)) return;
          const cached = await readFreshDetails(tmdbId, lang, region);
          if (cached && !details.has(tmdbId)) details.set(tmdbId, cached);
        }),
      );
      if (signal.aborted) return;
      let current = listFilms;
      for (;;) {
        const judged = current.map((film) =>
          failedKeys.has(film.key) ? { ...film, confidence: 0 } : film,
        );
        const next = planListPage(judged, details, filters, services, limit, LOOKUP_BATCH);
        if (signal.aborted) return;
        setResult({ request, limit: next.done ? limit : 0, plan: next });
        if (next.pending.length === 0) return;

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
        const learned: StoredFilm[] = [];
        await mapLimit(
          wanted,
          4,
          async (film) => {
            const tmdbId = film.tmdbId!;
            try {
              const detail = await fetchDetails(tmdbId, signal, lang, region);
              details.set(tmdbId, detail);
              if (!film.facts) learned.push({ ...film, facts: factsOf(detail) });
            } catch {
              if (!signal.aborted) details.set(tmdbId, "failed");
            }
          },
          signal,
        );
        // One write for the whole batch: each write reads the entire library.
        if (learned.length > 0) {
          await library.upsertFilms(learned.map((film) => ({ ...film, lists: [] })));
        }
      }
    })();
    return () => controller.abort();
  }, [enabled, listFilms, filters, services, limit, lang, region, details, failedKeys, request]);

  const current = result.request === request;
  return {
    plan: current ? result.plan : EMPTY_PLAN,
    busy: enabled && (!current || result.limit !== limit),
  };
}
