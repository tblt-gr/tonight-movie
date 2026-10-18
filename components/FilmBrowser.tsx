"use client";

import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FilmCard, type CardFilm } from "@/components/FilmCard";
import { FilmDialog } from "@/components/FilmDialog";
import {
  DEFAULT_FILTERS,
  LOOKUP_BATCH,
  PAGE_SIZE,
  SERVICE_ANY,
  SERVICE_MINE,
  filterGlobalResults,
  genresOf,
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
import { fetchDetails, fetchDiscover, fetchProviderNames, mapLimit } from "@/lib/browse-client";
import { SERVICES_SOURCE_ID, effectiveSources } from "@/lib/draw";
import {
  SERVICES_SOURCE_LABEL,
  durationLabel,
  durationOptions,
  offersToShow,
} from "@/lib/draw-state";
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
import type { MovieSummary } from "@/lib/types";

const SORT_LABELS: Record<BrowseSort, string> = {
  rank: "Ordre de la source",
  rating: "Note",
  runtime: "Durée",
  title: "Titre",
  year: "Année",
};

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
  const [providerNames, setProviderNames] = useState<Map<string, string>>(new Map());
  const [queryInput, setQueryInput] = useState(filters.query);
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CardFilm | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Details looked up so far; the effects below own it and bump `tick` to redraw.
  const detailsRef = useRef(new Map<number, DetailState>());
  const failedRef = useRef(new Set<string>());
  const [, setTick] = useState(0);

  const [plan, setPlan] = useState<ListPlan>(EMPTY_PLAN);
  const [genres, setGenres] = useState<string[]>([]);
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
    const controller = new AbortController();
    fetchProviderNames(controller.signal)
      .then(setProviderNames)
      .catch(() => undefined);
    return () => {
      alive = false;
      stop();
      controller.abort();
    };
  }, []);

  const sources = effectiveSources(settings.sources, lists);
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
  const sourceNames = sources
    .map((id) =>
      id === SERVICES_SOURCE_ID
        ? SERVICES_SOURCE_LABEL
        : lists.find((list) => list.id === id)?.name,
    )
    .filter(Boolean)
    .join(", ");
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
        setGenres(genresOf(detailsRef.current.values()));
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
              detailsRef.current.set(tmdbId, await fetchDetails(tmdbId, signal));
            } catch {
              if (!signal.aborted) detailsRef.current.set(tmdbId, "failed");
            }
          },
          signal,
        );
      }
    })();
    return () => controller.abort();
  }, [ready, mode, listFilms, filters, services, limit]);

  // The global source: TMDB discover pages, then the details of each page for chips and duration.
  const providers = useMemo(() => {
    const own = settings.services.map(Number).filter(Number.isFinite);
    const wanted = /^\d+$/.test(filters.service) ? [Number(filters.service)] : own;
    return wanted.slice(0, MAX_PROVIDERS);
  }, [settings.services, filters.service]);
  const discoverSort = DISCOVER_SORT[filters.sort];
  const pagesWanted = Math.ceil(limit / PAGE_SIZE);
  const globalKey = `${providers.join(",")}|${filters.maxDuration}|${discoverSort}`;
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
            signal,
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
              detailsRef.current.set(movie.tmdbId, await fetchDetails(movie.tmdbId, signal));
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
  }, [ready, mode, providers, globalKey, pagesWanted, filters.maxDuration, discoverSort, retry]);

  const offerNames = (detail: Parameters<typeof offersToShow>[0] | undefined) =>
    detail ? offersToShow(detail, services).map((offer) => offer.name) : [];

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
        offerNames: offerNames(detail),
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
        offerNames: offerNames(loaded),
        uncertain: false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `offerNames` only reads `services`.
  }, [mode, plan, filters.sort, filters.hideSeen, global, globalKey, films, services]);

  const serviceOptions = [
    { value: SERVICE_MINE, label: "Tous mes services" },
    ...settings.services.map((id) => ({
      value: id,
      label: providerNames.get(id) ?? `Service ${id}`,
    })),
    ...(mode === "lists" ? [{ value: SERVICE_ANY, label: "Peu importe" }] : []),
  ];
  const serviceValue = serviceOptions.some((option) => option.value === filters.service)
    ? filters.service
    : SERVICE_MINE;
  const genreOptions =
    filters.genre && !genres.includes(filters.genre) ? [...genres, filters.genre] : genres;
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
        ? "Recherche des films en cours…"
        : `${cards.length} films affichés, recherche de la suite en cours…`
      : empty
        ? ""
        : `${cards.length} film${cards.length > 1 ? "s" : ""} affiché${cards.length > 1 ? "s" : ""}.`;

  return (
    <>
      <p className="browse-source">
        Source : <strong>{sourceNames || SERVICES_SOURCE_LABEL}</strong>
        {" · "}
        <Link href="/tirage">Retour au tirage</Link>
      </p>

      {ready && (
        <div className="filters" role="search">
          {mode === "lists" && (
            <div className="filter">
              <label htmlFor={`${ids}-q`}>Titre</label>
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
          <div className="filter">
            <label htmlFor={`${ids}-service`}>Service</label>
            <select
              className="select"
              id={`${ids}-service`}
              value={serviceValue}
              onChange={(event) => update({ service: event.target.value })}
            >
              {serviceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter">
            <label htmlFor={`${ids}-duration`}>Durée maximale</label>
            <select
              className="select"
              id={`${ids}-duration`}
              value={filters.maxDuration ?? ""}
              onChange={(event) =>
                update({ maxDuration: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Sans limite</option>
              {durationOptions(filters.maxDuration).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes)}
                </option>
              ))}
            </select>
          </div>
          {mode === "lists" && (
            <div className="filter">
              <label htmlFor={`${ids}-genre`}>Genre</label>
              <select
                className="select"
                id={`${ids}-genre`}
                value={filters.genre ?? ""}
                onChange={(event) => update({ genre: event.target.value || null })}
              >
                <option value="">Tous les genres</option>
                {genreOptions.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter">
            <label htmlFor={`${ids}-sort`}>Tri</label>
            <select
              className="select"
              id={`${ids}-sort`}
              value={sortValue}
              onChange={(event) => update({ sort: event.target.value as BrowseSort })}
            >
              {sortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {mode === "services" && sort === "rank" ? "Popularité" : SORT_LABELS[sort]}
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
              <label htmlFor={`${ids}-seen`}>Masquer les films déjà vus</label>
            </div>
          )}
          <div className="filter">
            <span className="field-label" id={`${ids}-view`}>
              Affichage
            </span>
            <div className="view-toggle" role="group" aria-labelledby={`${ids}-view`}>
              <button
                type="button"
                className="button"
                aria-pressed={filters.view === "grid"}
                onClick={() => update({ view: "grid" })}
              >
                <LayoutGrid aria-hidden="true" /> Grille
              </button>
              <button
                type="button"
                className="button"
                aria-pressed={filters.view === "list"}
                onClick={() => update({ view: "list" })}
              >
                <List aria-hidden="true" /> Liste
              </button>
            </div>
          </div>
          {filtersChanged && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setQueryInput("");
                update({ ...DEFAULT_FILTERS, view: filters.view });
              }}
            >
              Réinitialiser
            </button>
          )}
          {cards.length > 0 && (
            <p className="filters-count" aria-hidden="true">
              {cards.length}
              <span className="label">{cards.length > 1 ? "films" : "film"}</span>
            </p>
          )}
        </div>
      )}

      <h2 className="sr-only">Résultats</h2>
      <p role="status" className={`browse-status${failed ? " sr-only" : ""}`}>
        {status}
      </p>
      {mode === "lists" && (filters.sort === "rating" || filters.sort === "runtime") && more && (
        <p className="browse-hint">Ce tri s’applique aux films déjà chargés.</p>
      )}

      {failed && (
        <div className="browse-empty" role="alert">
          <p>Impossible de joindre TMDB pour le moment. Vérifiez votre connexion.</p>
          <button type="button" className="button primary" onClick={() => setRetry((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      )}

      {empty && (
        <div className="browse-empty">
          <p>
            {mode === "lists" && listFilms.length === 0
              ? "Cette source ne contient aucun film."
              : "Aucun film ne correspond à ces filtres."}
          </p>
          {filtersChanged && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setQueryInput("");
                update({ ...DEFAULT_FILTERS, view: filters.view });
              }}
            >
              Réinitialiser les filtres
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
          {busy ? "Chargement…" : "Afficher plus de films"}
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
