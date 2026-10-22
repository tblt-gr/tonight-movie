"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilmCard, type CardFilm } from "@/components/FilmCard";
import { FilmDialog } from "@/components/FilmDialog";
import { FilterBar } from "@/components/FilterBar";
import { useI18n } from "@/components/I18nProvider";
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  filterGlobalResults,
  parseFilters,
  seenIndex,
  serializeFilters,
  sortShown,
  type BrowseFilters,
  type BrowseMode,
  type DetailState,
  type Shown,
} from "@/lib/browse";
import { fetchProviders } from "@/lib/browse-client";
import { browserRegion } from "@/lib/regions";
import { SERVICES_SOURCE_ID, effectiveSources } from "@/lib/draw";
import { offersToShow } from "@/lib/draw-state";
import { useGlobalSource } from "@/lib/use-global-source";
import { useListPlan } from "@/lib/use-list-plan";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type StoredFilm,
  type StoredList,
} from "@/lib/storage/schema";
import { loadSettings } from "@/lib/storage/settings";
import type { ProviderInfo } from "@/lib/types";

export function FilmBrowser() {
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
  const region = browserRegion(settings.region);
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CardFilm | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Details looked up so far; the effects below own it and bump `tick` to redraw.
  const [details] = useState(() => new Map<number, DetailState>());
  const [failedKeys] = useState(() => new Set<string>());
  const [, setTick] = useState(0);

  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const [savedLists, savedFilms] = await Promise.all([library.getLists(), library.getFilms()]);
      if (!alive) return;
      details.clear();
      failedKeys.clear();
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
  }, [details, failedKeys]);

  useEffect(() => {
    const controller = new AbortController();
    if (!ready) return;
    fetchProviders(controller.signal, lang, region)
      .then(setProviderInfo)
      .catch(() => undefined);
    return () => controller.abort();
  }, [lang, region, ready]);

  const sources = effectiveSources(filters.source ? [filters.source] : settings.sources, lists);
  const sourceKey = sources.join("|");
  const listIds = useMemo(
    () => new Set(sourceKey.split("|").filter((id) => id && id !== SERVICES_SOURCE_ID)),
    [sourceKey],
  );
  const mode: BrowseMode = listIds.size > 0 ? "lists" : "services";
  const listFilms = useMemo(
    () => films.filter((film) => !film.ignored && film.lists.some((id) => listIds.has(id))),
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

  const bumpDetails = useCallback(() => setTick((tick) => tick + 1), []);
  const list = useListPlan({
    enabled: ready && mode === "lists",
    listFilms,
    filters,
    services,
    limit,
    lang,
    region,
    details,
    failedKeys,
  });
  const source = useGlobalSource({
    enabled: ready && mode === "services",
    ownServices: settings.services,
    filters,
    limit,
    lang,
    region,
    retry,
    details,
    onDetail: bumpDetails,
  });
  const { plan } = list;
  const { global, key: globalKey, failed } = source;
  const busy = mode === "lists" ? list.busy : source.busy;

  // Cards show the offers on the visitor's services and on any service the filter picked.
  const cardServices = new Set([...services, ...filters.services]);
  const cardOffers = (detail: Parameters<typeof offersToShow>[0] | undefined) =>
    detail ? offersToShow(detail, cardServices).map(({ name, icon }) => ({ name, icon })) : [];

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
      const detail = details.get(movie.tmdbId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cardOffers` only reads `services` and `filters.services`.
  }, [
    mode,
    plan,
    filters.sort,
    filters.hideSeen,
    global,
    globalKey,
    films,
    services,
    filters.services,
  ]);

  const filtersChanged = filterKey !== "";
  const resetFilters = () =>
    update({ ...DEFAULT_FILTERS, source: filters.source, view: filters.view });

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
        <FilterBar
          filters={filters}
          update={update}
          mode={mode}
          sources={sources}
          lists={lists}
          settingsServices={settings.services}
          services={services}
          providerInfo={providerInfo}
          hasSeen={hasSeen}
          filtersChanged={filtersChanged}
          onReset={resetFilters}
        />
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
            <button type="button" className="button" onClick={resetFilters}>
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
          region={region}
          onClose={() => setSelected(null)}
          opener={openerRef}
        />
      )}
    </>
  );
}
