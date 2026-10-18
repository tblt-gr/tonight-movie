"use client";

import { ChevronDown, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FilmCard, type CardFilm } from "@/components/FilmCard";
import { FilmDialog } from "@/components/FilmDialog";
import { useI18n } from "@/components/I18nProvider";
import { MultiSelect } from "@/components/MultiSelect";
import { RangeField } from "@/components/RangeField";
import {
  DEFAULT_FILTERS,
  LOOKUP_BATCH,
  PAGE_SIZE,
  SERVICE_ANY,
  filterGlobalResults,
  parseFilters,
  planListPage,
  seenIndex,
  serializeFilters,
  sortShown,
  sortsFor,
  type BrowseFilters,
  type BrowseMode,
  type BrowseSort,
  type DetailState,
  type ListPlan,
  type Shown,
} from "@/lib/browse";
import { fetchDetails, fetchDiscover, fetchProviders, mapLimit } from "@/lib/browse-client";
import { SERVICES_SOURCE_ID, effectiveSources } from "@/lib/draw";
import { GENRES, genreIds } from "@/lib/genres";
import {
  DURATION_SCALE,
  RATING_SCALE,
  durationLabel,
  durationOptions,
  hoursLabel,
  keepOrder,
  limitAt,
  offersToShow,
  positionOf,
  sourceOptions,
  yearScale,
} from "@/lib/draw-state";
import { summarizeNames } from "@/lib/services";
import { fetchSearch, resolveFilms } from "@/lib/resolve";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type StoredFilm,
  type StoredList,
} from "@/lib/storage/schema";
import { loadSettings } from "@/lib/storage/settings";
import type { DiscoverSort } from "@/lib/validation";
import { MAX_PROVIDERS } from "@/lib/validation";
import type { MovieSummary, ProviderInfo } from "@/lib/types";

const DISCOVER_SORT: Record<BrowseSort, DiscoverSort> = {
  rank: "popularity",
  rating: "rating",
  year: "year",
  title: "popularity",
  runtime: "popularity",
};

type GlobalState = {
  key: string;
  results: MovieSummary[];
  page: number;
  totalPages: number;
};

const EMPTY_PLAN: ListPlan = { shown: [], pending: [], done: false, exhausted: false };

export function FilmBrowser() {
  const ids = useId();
  const { lang, t, href } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The URL is the source of truth on arrival; afterwards state leads and the URL follows,
  // so a control never waits for the router to confirm a change.
  const [filters, setFilters] = useState(() =>
    parseFilters(new URLSearchParams(searchParams.toString())),
  );
  const filterKey = serializeFilters(filters);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [films, setFilms] = useState<StoredFilm[]>([]);
  const [ready, setReady] = useState(false);
  const [providerInfo, setProviderInfo] = useState<Map<string, ProviderInfo>>(new Map());
  const [queryInput, setQueryInput] = useState(filters.query);
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      filters.maxDuration !== null ||
      filters.minDuration !== null ||
      filters.minRating !== null ||
      filters.minYear !== null ||
      filters.maxYear !== null ||
      filters.genres.length > 0,
  );
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CardFilm | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Details looked up so far; the effects below own it and bump `tick` to redraw.
  const detailsRef = useRef(new Map<number, DetailState>());
  const failedRef = useRef(new Set<string>());
  const [, setTick] = useState(0);

  const [plan, setPlan] = useState<ListPlan>(EMPTY_PLAN);
  const [global, setGlobal] = useState<GlobalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const [savedLists, savedFilms] = await Promise.all([library.getLists(), library.getFilms()]);
      if (!alive) return;
      detailsRef.current = new Map();
      failedRef.current = new Set();
      setSettings(loadSettings());
      setLists(savedLists);
      setFilms(savedFilms);
      setReady(true);
    }
    void refresh();
    const stop = onReset(() => void refresh());
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchProviders(controller.signal, lang)
      .then(setProviderInfo)
      .catch(() => undefined);
    return () => controller.abort();
  }, [lang]);

  const sources = effectiveSources(filters.source ? [filters.source] : settings.sources, lists);
  const listIds = useMemo(
    () => new Set(sources.filter((id) => id !== SERVICES_SOURCE_ID)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sources` is rebuilt on each render.
    [sources.join("|")],
  );
  const mode: BrowseMode = listIds.size > 0 ? "lists" : "services";
  const listFilms = useMemo(
    () => films.filter((film) => film.lists.some((id) => listIds.has(id))),
    [films, listIds],
  );
  const services = useMemo(() => new Set(settings.services), [settings.services]);
  const hasSeen = useMemo(() => films.some((film) => film.seen), [films]);

  const update = useCallback(
    (patch: Partial<BrowseFilters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      const query = serializeFilters(next);
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [filters, pathname],
  );

  // Imported lists: match and look up only the films a page needs, a batch at a time.
  useEffect(() => {
    if (!ready || mode !== "lists") return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let current = listFilms;
      for (;;) {
        const judged = current.map((film) =>
          failedRef.current.has(film.key) ? { ...film, confidence: 0 } : film,
        );
        const next = planListPage(
          judged,
          detailsRef.current,
          filters,
          services,
          limit,
          LOOKUP_BATCH,
        );
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
            if (fresh.get(key)?.confidence == null) failedRef.current.add(key);
          }
        }

        const pendingKeys = new Set(next.pending.map((film) => film.key));
        const wanted = current.filter(
          (film) =>
            pendingKeys.has(film.key) &&
            film.confidence === 1 &&
            film.tmdbId !== null &&
            !detailsRef.current.has(film.tmdbId),
        );
        await mapLimit(
          wanted,
          4,
          async (film) => {
            const tmdbId = film.tmdbId!;
            try {
              detailsRef.current.set(tmdbId, await fetchDetails(tmdbId, signal, lang));
            } catch {
              if (!signal.aborted) detailsRef.current.set(tmdbId, "failed");
            }
          },
          signal,
        );
      }
    })();
    return () => controller.abort();
  }, [ready, mode, listFilms, filters, services, limit, lang]);

  // The global source: TMDB discover pages, then the details of each page for chips and duration.
  const providers = useMemo(() => {
    const own = settings.services.map(Number).filter(Number.isFinite);
    const chosen = filters.services.filter((id) => /^\d+$/.test(id)).map(Number);
    return (chosen.length > 0 ? chosen : own).slice(0, MAX_PROVIDERS);
  }, [settings.services, filters.services]);
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
  const globalKey = `${providers.join(",")}|${filters.maxDuration}|${discoverSort}|${JSON.stringify(discoverFilters)}`;
  const globalRef = useRef<GlobalState | null>(null);

  useEffect(() => {
    if (!ready || mode !== "services" || providers.length === 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let state: GlobalState =
        globalRef.current?.key === globalKey
          ? globalRef.current
          : { key: globalKey, results: [], page: 0, totalPages: Infinity };
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
          key: globalKey,
          results: [...state.results, ...response.results.filter((m) => !known.has(m.tmdbId))],
          page: state.page + 1,
          totalPages: response.totalPages,
        };
        globalRef.current = state;
        setGlobal(state);
        void mapLimit(
          response.results.filter((movie) => !detailsRef.current.has(movie.tmdbId)),
          4,
          async (movie) => {
            try {
              detailsRef.current.set(movie.tmdbId, await fetchDetails(movie.tmdbId, signal, lang));
            } catch {
              return;
            }
            if (!signal.aborted) setTick((tick) => tick + 1);
          },
          signal,
        );
      }
      setBusy(false);
    })();
    return () => controller.abort();
  }, [
    ready,
    mode,
    providers,
    globalKey,
    pagesWanted,
    filters.maxDuration,
    discoverSort,
    discoverFilters,
    retry,
    lang,
  ]);

  const cardOffers = (detail: Parameters<typeof offersToShow>[0] | undefined) =>
    detail ? offersToShow(detail, services).map(({ name, icon }) => ({ name, icon })) : [];

  const cards: CardFilm[] = useMemo(() => {
    if (mode === "lists") {
      return sortShown(plan.shown, filters.sort).map(({ film, detail, uncertain }: Shown) => ({
        id: film.key,
        tmdbId: film.confidence === 1 ? film.tmdbId : null,
        title: film.title,
        year: film.year,
        poster: detail?.poster ?? null,
        rating: detail?.rating ?? null,
        runtime: detail?.runtime ?? null,
        offers: cardOffers(detail),
        uncertain,
      }));
    }
    if (!global || global.key !== globalKey) return [];
    const visible = filterGlobalResults(global.results, seenIndex(films), filters.hideSeen);
    return visible.map((movie) => {
      const detail = detailsRef.current.get(movie.tmdbId);
      const loaded = typeof detail === "object" ? detail : undefined;
      return {
        id: `tmdb:${movie.tmdbId}`,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        poster: movie.poster,
        rating: movie.rating,
        runtime: loaded?.runtime ?? null,
        offers: cardOffers(loaded),
        uncertain: false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cardOffers` only reads `services`.
  }, [mode, plan, filters.sort, filters.hideSeen, global, globalKey, films, services]);

  const serviceOptions: ProviderInfo[] = [
    ...(mode === "lists" ? [{ id: SERVICE_ANY, name: t.browse.anyService, logo: null }] : []),
    ...settings.services.map(
      (id) => providerInfo.get(id) ?? { id, name: t.browse.serviceFallback(id), logo: null },
    ),
  ];
  const serviceSelected = useMemo(
    () => new Set(filters.services.filter((id) => serviceOptions.some((o) => o.id === id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `serviceOptions` follows these two.
    [filters.services, settings.services, providerInfo, mode],
  );
  const chosenNames = serviceOptions.filter((o) => serviceSelected.has(o.id)).map((o) => o.name);
  const servicesSummary = summarizeNames(chosenNames, t.browse.allMine);
  const years = yearScale();
  const sourceValue = sources.length === 1 ? sources[0] : "many";
  const advancedCount =
    (filters.maxDuration !== null ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.minDuration !== null ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0) +
    (filters.minYear !== null ? 1 : 0) +
    (filters.maxYear !== null ? 1 : 0) +
    (filters.genres.length > 0 ? 1 : 0);

  function moveDuration(side: "minDuration" | "maxDuration", value: number) {
    const limit = limitAt(value, side === "minDuration" ? DURATION_SCALE.min : DURATION_SCALE.max);
    update(
      keepOrder(
        { minDuration: filters.minDuration, maxDuration: filters.maxDuration, [side]: limit },
        side,
        side === "minDuration" ? "maxDuration" : "minDuration",
        side === "minDuration",
      ),
    );
  }

  function moveYear(side: "minYear" | "maxYear", value: number) {
    const limit = limitAt(value, side === "minYear" ? years.min : years.max);
    update(
      keepOrder(
        { minYear: filters.minYear, maxYear: filters.maxYear, [side]: limit },
        side,
        side === "minYear" ? "maxYear" : "minYear",
        side === "minYear",
      ),
    );
  }
  const sortOptions = sortsFor(mode);
  const sortValue = sortOptions.includes(filters.sort) ? filters.sort : DEFAULT_FILTERS.sort;

  const more =
    mode === "lists"
      ? plan.done && !plan.exhausted
      : global !== null && global.page < global.totalPages;
  const listLoading = mode === "lists" && busy;
  const empty =
    cards.length === 0 &&
    !busy &&
    !failed &&
    (mode === "lists" ? plan.done : global !== null && global.page > 0);
  const filtersChanged = filterKey !== "";

  const status = failed
    ? ""
    : busy
      ? cards.length === 0
        ? t.browse.searching
        : t.browse.shownMore(cards.length)
      : empty
        ? ""
        : t.browse.shown(cards.length);

  return (
    <>
      <p className="browse-source">
        <Link href={href("draw")}>{t.browse.back}</Link>
      </p>

      {ready && (
        <div className="filters" role="search">
          <div className="filter">
            <label htmlFor={`${ids}-source`}>{t.draw.source}</label>
            <select
              className="select"
              id={`${ids}-source`}
              value={sourceValue}
              onChange={(event) => update({ source: event.target.value, services: [] })}
            >
              {sourceValue === "many" && (
                <option value="many" disabled>
                  {t.draw.manySources}
                </option>
              )}
              {sourceOptions(lists, t).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          {mode === "lists" && (
            <div className="filter">
              <label htmlFor={`${ids}-q`}>{t.browse.queryLabel}</label>
              <input
                id={`${ids}-q`}
                type="search"
                value={queryInput}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => {
                  setQueryInput(event.target.value);
                  update({ query: event.target.value });
                }}
              />
            </div>
          )}
          <div className="filter filter-services">
            <MultiSelect
              label={t.browse.services}
              options={serviceOptions}
              selected={serviceSelected}
              onChange={(next) => update({ services: [...next] })}
              emptyMessage={t.services.empty}
              removeLabel={t.services.remove}
              summary={servicesSummary}
            />
          </div>
          <div className="filter">
            <label htmlFor={`${ids}-sort`}>{t.browse.sort}</label>
            <select
              className="select"
              id={`${ids}-sort`}
              value={sortValue}
              onChange={(event) => update({ sort: event.target.value as BrowseSort })}
            >
              {sortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {mode === "services" && sort === "rank"
                    ? t.browse.sorts.popularity
                    : t.browse.sorts[sort]}
                </option>
              ))}
            </select>
          </div>
          <div className="view-toggle" role="group" aria-label={t.browse.view}>
            <button
              type="button"
              className="button"
              aria-pressed={filters.view === "grid"}
              aria-label={t.browse.grid}
              title={t.browse.grid}
              onClick={() => update({ view: "grid" })}
            >
              <LayoutGrid aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={filters.view === "list"}
              aria-label={t.browse.list}
              title={t.browse.list}
              onClick={() => update({ view: "list" })}
            >
              <List aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="button filters-toggle"
            aria-expanded={advancedOpen}
            aria-controls={`${ids}-advanced`}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            {t.draw.filters(advancedCount)}
            <ChevronDown aria-hidden="true" />
          </button>
          {advancedOpen && (
            <div
              className="browse-filters-panel"
              id={`${ids}-advanced`}
              role="group"
              aria-label={t.filters.advanced}
            >
              <div className="filter">
                <label htmlFor={`${ids}-duration`}>{t.filters.maxDuration}</label>
                <select
                  className="select"
                  id={`${ids}-duration`}
                  value={filters.maxDuration ?? ""}
                  onChange={(event) =>
                    update({ maxDuration: event.target.value ? Number(event.target.value) : null })
                  }
                >
                  <option value="">{t.filters.maxDurationNone}</option>
                  {durationOptions(filters.maxDuration).map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {durationLabel(minutes, t)}
                    </option>
                  ))}
                </select>
              </div>
              {hasSeen && (
                <div className="check">
                  <input
                    id={`${ids}-seen`}
                    type="checkbox"
                    checked={filters.hideSeen}
                    onChange={(event) => update({ hideSeen: event.target.checked })}
                  />
                  <label htmlFor={`${ids}-seen`}>{t.common.hideSeen}</label>
                </div>
              )}
              <RangeField
                label={t.filters.minDuration}
                display={
                  filters.minDuration === null
                    ? t.filters.minDurationNone
                    : hoursLabel(filters.minDuration, t)
                }
                value={positionOf(
                  filters.minDuration,
                  DURATION_SCALE.min,
                  DURATION_SCALE.min,
                  DURATION_SCALE.max,
                )}
                {...DURATION_SCALE}
                onChange={(value) => moveDuration("minDuration", value)}
              />
              <RangeField
                label={t.filters.minRating}
                display={
                  filters.minRating === null
                    ? t.filters.minRatingNone
                    : `${filters.minRating.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`
                }
                value={positionOf(
                  filters.minRating,
                  RATING_SCALE.min,
                  RATING_SCALE.min,
                  RATING_SCALE.max,
                )}
                {...RATING_SCALE}
                onChange={(value) => update({ minRating: limitAt(value, RATING_SCALE.min) })}
              />
              <RangeField
                label={t.filters.minYear}
                display={filters.minYear === null ? t.filters.minYearNone : String(filters.minYear)}
                value={positionOf(filters.minYear, years.min, years.min, years.max)}
                {...years}
                onChange={(value) => moveYear("minYear", value)}
              />
              <RangeField
                label={t.filters.maxYear}
                display={filters.maxYear === null ? t.filters.maxYearNone : String(filters.maxYear)}
                value={positionOf(filters.maxYear, years.max, years.min, years.max)}
                {...years}
                onChange={(value) => moveYear("maxYear", value)}
              />
              <fieldset className="genre-field">
                <legend>{t.filters.genres}</legend>
                <div className="genre-chips">
                  {GENRES.map((genre) => (
                    <label key={genre.id} className="genre-chip">
                      <input
                        type="checkbox"
                        checked={filters.genres.includes(genre.name)}
                        onChange={(event) =>
                          update({
                            genres: event.target.checked
                              ? [...filters.genres, genre.name]
                              : filters.genres.filter((name) => name !== genre.name),
                          })
                        }
                      />
                      <span>{t.genres[genre.name] ?? genre.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="button"
                className="button browse-filters-reset"
                disabled={!filtersChanged}
                onClick={() => {
                  setQueryInput("");
                  update({ ...DEFAULT_FILTERS, source: filters.source, view: filters.view });
                }}
              >
                {t.filters.reset}
              </button>
            </div>
          )}
        </div>
      )}

      <h2 className="sr-only">{t.browse.results}</h2>
      <p role="status" className={`browse-status${failed ? " sr-only" : ""}`}>
        {status}
      </p>
      {mode === "lists" && (filters.sort === "rating" || filters.sort === "runtime") && more && (
        <p className="browse-hint">{t.browse.sortHint}</p>
      )}

      {failed && (
        <div className="browse-empty" role="alert">
          <p>{t.common.unreachable}</p>
          <button type="button" className="button primary" onClick={() => setRetry((n) => n + 1)}>
            {t.common.retry}
          </button>
        </div>
      )}

      {empty && (
        <div className="browse-empty">
          <p>
            {mode === "lists" && listFilms.length === 0
              ? t.browse.emptySource
              : t.browse.emptyFilters}
          </p>
          {filtersChanged && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setQueryInput("");
                update({ ...DEFAULT_FILTERS, source: filters.source, view: filters.view });
              }}
            >
              {t.filters.reset}
            </button>
          )}
        </div>
      )}

      {cards.length > 0 && (
        <ul className={`film-grid${filters.view === "list" ? " is-list" : ""}`}>
          {cards.map((card) => (
            <FilmCard
              key={card.id}
              film={card}
              onOpen={(opener) => {
                openerRef.current = opener;
                setSelected(card);
              }}
            />
          ))}
        </ul>
      )}

      {(more || listLoading) && cards.length > 0 && (
        <button
          type="button"
          className="button browse-more"
          aria-disabled={busy}
          onClick={() => {
            if (!busy) setPaging({ key: filterKey, limit: limit + PAGE_SIZE });
          }}
        >
          {busy ? t.browse.loading : t.browse.more}
        </button>
      )}

      {selected && (
        <FilmDialog
          film={selected}
          services={services}
          onClose={() => setSelected(null)}
          opener={openerRef}
        />
      )}
    </>
  );
}
