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
  const filterKey = serializeFilters({ ...filters, view: "grid" });
  // Presentation changes keep the same data request and the number of visible films.
  const dataFilters = useMemo(() => parseFilters(new URLSearchParams(filterKey)), [filterKey]);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [films, setFilms] = useState<StoredFilm[]>([]);
  const [ready, setReady] = useState(false);
  const [providerInfo, setProviderInfo] = useState<Map<string, ProviderInfo>>(new Map());
  const region = browserRegion(settings.region);
  const paginationKey = serializeFilters({ ...filters, view: "grid", sort: "rank", order: "desc" });
  const [paging, setPaging] = useState({ key: paginationKey, limit: PAGE_SIZE });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CardFilm | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Both sources share the details already loaded during this visit.
  const [details] = useState(() => new Map<number, DetailState>());
  const [failedKeys] = useState(() => new Set<string>());

  const limit = paging.key === paginationKey ? paging.limit : PAGE_SIZE;

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
  const seen = useMemo(() => seenIndex(films), [films]);
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

  const list = useListPlan({
    enabled: ready && mode === "lists",
    listFilms,
    filters: dataFilters,
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
    seen,
    filters: dataFilters,
    limit,
    lang,
    region,
    retry,
    details,
  });
  const { plan } = list;
  const { global, key: globalKey } = source;
  const failed = mode === "services" && source.failed;
  const busy = !ready || (mode === "lists" ? list.busy : source.busy);

  // Cards show the offers on the visitor's services and on any service the filter picked.
  const cardServices = new Set([...services, ...filters.services]);
  const cardOffers = (detail: Parameters<typeof offersToShow>[0] | undefined) =>
    detail ? offersToShow(detail, cardServices).map(({ name, icon }) => ({ name, icon })) : [];

  const cards: CardFilm[] = useMemo(() => {
    if (mode === "lists") {
      return plan.shown.map(({ film, detail, uncertain }: Shown) => ({
        id: film.key,
        tmdbId: film.confidence === 1 ? film.tmdbId : null,
        title: film.title,
        year: film.year ?? detail?.year ?? null,
        poster: detail?.poster ?? null,
        rating: detail?.rating ?? null,
        runtime: detail?.runtime ?? null,
        offers: cardOffers(detail),
        uncertain,
      }));
    }
    if (!global || global.key !== globalKey) return [];
    const visible = filterGlobalResults(global.results, seen, filters.hideSeen).slice(0, limit);
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
  }, [mode, plan, filters.hideSeen, global, globalKey, seen, limit, services, filters.services]);

  const filtersChanged = filterKey !== "";
  const resetFilters = () =>
    update({ ...DEFAULT_FILTERS, source: filters.source, view: filters.view });

  const more =
    mode === "lists"
      ? plan.done && !plan.exhausted
      : global !== null &&
        (filterGlobalResults(global.results, seen, filters.hideSeen).length > limit ||
          global.page < global.totalPages);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sentinelShown = more && !busy && cards.length > 0;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!sentinelShown || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setPaging({ key: paginationKey, limit: limit + PAGE_SIZE });
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinelShown, paginationKey, limit]);
  const skeletonCount = busy ? Math.max(0, limit - cards.length) : 0;
  const empty =
    cards.length === 0 &&
    !busy &&
    !failed &&
    (mode === "lists" ? plan.done : global !== null && global.page > 0);

  const status = failed
    ? ""
    : busy
      ? cards.length === 0
        ? mode === "lists" && plan.full && plan.total > 0
          ? t.browse.sorting(plan.judged, plan.total)
          : t.browse.searching
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
      {mode === "lists" && (filters.sort === "rating" || filters.sort === "runtime") && (
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

      {(cards.length > 0 || skeletonCount > 0) && (
        <ul
          className={`film-grid${filters.view === "list" ? " is-list" : ""}`}
          aria-label={t.browse.results}
          aria-busy={busy}
        >
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
          {Array.from({ length: skeletonCount }, (_, index) => (
            <li key={`skeleton:${index}`} className="film-card film-skeleton" aria-hidden="true">
              <div className="film-card-open">
                <span className="film-card-poster" />
                <span className="film-card-body">
                  <span className="film-skeleton-title" />
                  <span className="film-skeleton-meta" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {more && !busy && cards.length > 0 && (
        <div ref={sentinelRef} className="browse-sentinel" aria-hidden="true" />
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
