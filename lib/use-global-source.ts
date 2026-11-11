"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterGlobalResults,
  type SeenIndex,
  type BrowseFilters,
  type BrowseSort,
  type DetailState,
} from "@/lib/browse";
import { cachedDetails, fetchDetails, fetchDiscover, mapLimit } from "@/lib/browse-client";
import { genreIds } from "@/lib/genres";
import { runtimeBounds, startWalk, walkDone, walkStep, type RuntimeWalk } from "@/lib/runtime-walk";
import type { Locale } from "@/lib/i18n/config";
import type { MovieSummary } from "@/lib/types";
import { tmdbClient } from "@/lib/tmdb-client";
import { MAX_PROVIDERS, type DiscoverSort } from "@/lib/validation";

const DISCOVER_SORT: Record<BrowseSort, DiscoverSort> = {
  rank: "popularity",
  rating: "rating",
  year: "year",
  title: "popularity",
  runtime: "popularity",
};

export type GlobalState = {
  key: string;
  results: MovieSummary[];
  page: number;
  totalPages: number;
  /** Set when the results are read in duration order. */
  walk?: RuntimeWalk;
};

type Input = {
  enabled: boolean;
  /** The visitor's saved services, used when the filter picks none. */
  ownServices: readonly string[];
  filters: BrowseFilters;
  seen: SeenIndex;
  limit: number;
  lang: Locale;
  region: string;
  /** Changes to run the search again after a failure. */
  retry: number;
  details: Map<number, DetailState>;
};

/** The global source: TMDB discover pages, then the details of each page for chips and duration. */
export function useGlobalSource({
  enabled,
  ownServices,
  filters,
  seen,
  limit,
  lang,
  region,
  retry,
  details,
}: Input) {
  const [global, setGlobal] = useState<GlobalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const lastRetry = useRef(retry);
  const globalRef = useRef<GlobalState | null>(null);

  const providers = useMemo(() => {
    const own = ownServices.map(Number).filter(Number.isFinite);
    const chosen = filters.services.filter((id) => /^\d+$/.test(id)).map(Number);
    return (chosen.length > 0 ? chosen : own).slice(0, MAX_PROVIDERS);
  }, [ownServices, filters.services]);
  const discoverSort: DiscoverSort =
    filters.order === "asc" && (filters.sort === "rating" || filters.sort === "year")
      ? `${filters.sort}-asc`
      : DISCOVER_SORT[filters.sort];
  const discoverFilters = useMemo(
    () => ({
      minRuntime: filters.minDuration,
      minRating: filters.minRating,
      minYear: filters.minYear,
      maxYear: filters.maxYear,
      genres: genreIds(filters.genres),
    }),
    [filters.minDuration, filters.minRating, filters.minYear, filters.maxYear, filters.genres],
  );
  const bounds = useMemo(
    () =>
      filters.sort === "runtime"
        ? runtimeBounds(filters.order, filters.minDuration, filters.maxDuration)
        : null,
    [filters.sort, filters.order, filters.minDuration, filters.maxDuration],
  );
  const key = `${lang}|${region}|${providers.join(",")}|${filters.maxDuration}|${discoverSort}|${JSON.stringify(discoverFilters)}|${bounds ? `${bounds.order}:${bounds.min}:${bounds.max}` : ""}`;

  useEffect(() => {
    if (!enabled || providers.length === 0) return;
    if (lastRetry.current !== retry) {
      lastRetry.current = retry;
      tmdbClient.retryFailures();
    }
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let state: GlobalState =
        globalRef.current?.key === key
          ? globalRef.current
          : {
              key,
              results: [],
              page: 0,
              totalPages: Infinity,
              ...(bounds ? { walk: startWalk(bounds) } : {}),
            };
      setFailedKey(null);
      setGlobal(state);
      const enrich = (snapshot: GlobalState) => {
        return mapLimit(
          filterGlobalResults(snapshot.results, seen, filters.hideSeen)
            .slice(0, limit)
            .filter(
              (movie) => !details.has(movie.tmdbId) || !cachedDetails(movie.tmdbId, lang, region),
            ),
          4,
          async (movie) => {
            try {
              const detail = await fetchDetails(movie.tmdbId, signal, lang, region);
              if (!signal.aborted) {
                details.set(movie.tmdbId, detail);
                setGlobal((current) => (current?.key === key ? { ...current } : current));
              }
            } catch {
              return;
            }
          },
          signal,
        );
      };
      await enrich(state);
      if (signal.aborted) return;
      while (
        filterGlobalResults(state.results, seen, filters.hideSeen).length < limit &&
        state.page < state.totalPages
      ) {
        setBusy(true);
        let step: { results: MovieSummary[]; totalPages: number; walk?: RuntimeWalk };
        try {
          if (bounds && state.walk) {
            const walked = await walkStep(state.walk, bounds, (from, to, page) =>
              fetchDiscover(
                providers,
                to,
                page,
                discoverSort,
                { ...discoverFilters, minRuntime: from },
                signal,
                lang,
                region,
              ),
            );
            step = {
              results: walked.results,
              walk: walked.walk,
              totalPages: walkDone(walked.walk, bounds) ? state.page + 1 : Infinity,
            };
          } else {
            step = await fetchDiscover(
              providers,
              filters.maxDuration,
              state.page + 1,
              discoverSort,
              discoverFilters,
              signal,
              lang,
              region,
            );
          }
        } catch {
          if (!signal.aborted) {
            setFailedKey(key);
            setBusy(false);
          }
          return;
        }
        if (signal.aborted) return;
        const known = new Set(state.results.map((movie) => movie.tmdbId));
        state = {
          key,
          results: [...state.results, ...step.results.filter((m) => !known.has(m.tmdbId))],
          page: state.page + 1,
          totalPages: step.totalPages,
          ...(step.walk ? { walk: step.walk } : {}),
        };
        globalRef.current = state;
        setGlobal(state);
        await enrich(state);
        if (signal.aborted) return;
      }
      setBusy(false);
    })();
    return () => controller.abort();
  }, [
    enabled,
    providers,
    key,
    limit,
    seen,
    filters.hideSeen,
    filters.maxDuration,
    discoverSort,
    discoverFilters,
    bounds,
    retry,
    lang,
    region,
    details,
  ]);

  const current = global?.key === key;
  const failed = failedKey === key;
  return {
    global: current ? global : null,
    key,
    busy:
      enabled &&
      providers.length > 0 &&
      !failed &&
      (!current ||
        busy ||
        (filterGlobalResults(global.results, seen, filters.hideSeen).length < limit &&
          global.page < global.totalPages)),
    failed,
  };
}
