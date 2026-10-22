"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE, type BrowseFilters, type BrowseSort, type DetailState } from "@/lib/browse";
import { fetchDetails, fetchDiscover, mapLimit } from "@/lib/browse-client";
import { genreIds } from "@/lib/genres";
import type { Locale } from "@/lib/i18n/config";
import type { MovieSummary } from "@/lib/types";
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
};

type Input = {
  enabled: boolean;
  /** The visitor's saved services, used when the filter picks none. */
  ownServices: readonly string[];
  filters: BrowseFilters;
  limit: number;
  lang: Locale;
  /** Changes to run the search again after a failure. */
  retry: number;
  details: Map<number, DetailState>;
  /** Called when a film's details arrived, so the caller can redraw its cards. */
  onDetail: () => void;
};

/** The global source: TMDB discover pages, then the details of each page for chips and duration. */
export function useGlobalSource({
  enabled,
  ownServices,
  filters,
  limit,
  lang,
  retry,
  details,
  onDetail,
}: Input) {
  const [global, setGlobal] = useState<GlobalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const globalRef = useRef<GlobalState | null>(null);

  const providers = useMemo(() => {
    const own = ownServices.map(Number).filter(Number.isFinite);
    const chosen = filters.services.filter((id) => /^\d+$/.test(id)).map(Number);
    return (chosen.length > 0 ? chosen : own).slice(0, MAX_PROVIDERS);
  }, [ownServices, filters.services]);
  const discoverSort = DISCOVER_SORT[filters.sort];
  const pagesWanted = Math.ceil(limit / PAGE_SIZE);
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
  const key = `${providers.join(",")}|${filters.maxDuration}|${discoverSort}|${JSON.stringify(discoverFilters)}`;

  useEffect(() => {
    if (!enabled || providers.length === 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let state: GlobalState =
        globalRef.current?.key === key
          ? globalRef.current
          : { key, results: [], page: 0, totalPages: Infinity };
      setFailed(false);
      setGlobal(state);
      while (state.page < pagesWanted && state.page < state.totalPages) {
        setBusy(true);
        let response;
        try {
          response = await fetchDiscover(
            providers,
            filters.maxDuration,
            state.page + 1,
            discoverSort,
            discoverFilters,
            signal,
            lang,
          );
        } catch {
          if (!signal.aborted) {
            setFailed(true);
            setBusy(false);
          }
          return;
        }
        if (signal.aborted) return;
        const known = new Set(state.results.map((movie) => movie.tmdbId));
        state = {
          key,
          results: [...state.results, ...response.results.filter((m) => !known.has(m.tmdbId))],
          page: state.page + 1,
          totalPages: response.totalPages,
        };
        globalRef.current = state;
        setGlobal(state);
        void mapLimit(
          response.results.filter((movie) => !details.has(movie.tmdbId)),
          4,
          async (movie) => {
            try {
              details.set(movie.tmdbId, await fetchDetails(movie.tmdbId, signal, lang));
            } catch {
              return;
            }
            if (!signal.aborted) onDetail();
          },
          signal,
        );
      }
      setBusy(false);
    })();
    return () => controller.abort();
  }, [
    enabled,
    providers,
    key,
    pagesWanted,
    filters.maxDuration,
    discoverSort,
    discoverFilters,
    retry,
    lang,
    details,
    onDetail,
  ]);

  return { global, key, busy, failed };
}
