"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";
import {
  categoryOf,
  categoryText,
  collator,
  DEFAULT_OWNED,
  PRESETS,
  providerMap,
  relevantOffers,
  sortFilms,
} from "@/lib/catalog";
import type { Category, Sort } from "@/lib/catalog";
import type { Snapshot } from "@/lib/types";
import { DrawPanel } from "./DrawPanel";
import { FilmCard } from "./FilmCard";
import { PlatformDialog } from "./PlatformDialog";
import { PlatformIcon } from "./PlatformIcon";
import { ProfilePicker } from "./ProfilePicker";
import type { RecentList } from "./ProfilePicker";

const SETTINGS = "tonights-movie-settings-v1";
const HISTORY = "tonights-movie-list-history-v1";
const CATEGORY_ORDER: Category[] = ["all", "mine", "other", "none", "unknown"];
const CATEGORY_LABELS: Record<Category, string> = {
  all: "Tous les films",
  mine: "Sur mes plateformes",
  other: "Autres plateformes",
  none: "Indisponibles en streaming",
  unknown: "À vérifier",
};

type Saved = { owned?: string[]; sort?: Sort; view?: "grid" | "list"; includeRental?: boolean };

export function Catalog({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [ownedIds, setOwnedIds] = useState<string[]>(DEFAULT_OWNED);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [duration, setDuration] = useState("");
  const [rating, setRating] = useState("");
  const [sort, setSort] = useState<Sort>("rank");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [includeRental, setIncludeRental] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recent, setRecent] = useState<RecentList[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [loadStatus, setLoadStatus] = useState(
    "Choisissez une collection de votre profil ou collez un lien, sans compte.",
  );
  const [loadError, setLoadError] = useState(false);

  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);
  const providers = useMemo(() => providerMap(snapshot.films, snapshot.providers), [snapshot]);
  const counts = useMemo(() => {
    const values: Record<Category, number> = {
      all: snapshot.films.length,
      mine: 0,
      other: 0,
      none: 0,
      unknown: 0,
    };
    for (const film of snapshot.films) values[categoryOf(film, includeRental, owned)]++;
    return values;
  }, [snapshot, includeRental, owned]);
  const providerOptions = useMemo(
    () =>
      [
        ...new Map(
          snapshot.films.flatMap((film) =>
            relevantOffers(film, includeRental, owned).map(
              (offer) => [offer.id, offer.name] as const,
            ),
          ),
        ).entries(),
      ].sort((a, b) => collator.compare(a[1], b[1])),
    [snapshot, includeRental, owned],
  );
  const filtered = useMemo(() => {
    const term = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
    return sortFilms(
      snapshot.films.filter((film) => {
        if (category !== "all" && categoryOf(film, includeRental, owned) !== category) return false;
        if (
          term &&
          !film.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLocaleLowerCase("fr")
            .includes(term)
        )
          return false;
        if (
          provider &&
          !relevantOffers(film, includeRental, owned).some((offer) => offer.id === provider)
        )
          return false;
        if (duration && (!film.runtime || film.runtime > Number(duration))) return false;
        if (rating && (!film.rating || film.rating < Number(rating))) return false;
        return true;
      }),
      sort,
      includeRental,
      owned,
    );
  }, [snapshot, category, search, provider, duration, rating, sort, includeRental, owned]);

  const resetFilters = useCallback(() => {
    setCategory("all");
    setSearch("");
    setProvider("");
    setDuration("");
    setRating("");
  }, []);
  const applySnapshot = useCallback(
    (data: Snapshot, updateAddress: boolean) => {
      if (!Array.isArray(data.films) || !data.source)
        throw new Error("Données de liste invalides.");
      setSnapshot(data);
      resetFilters();
      setLoadError(false);
      setLoadStatus(`${data.films.length} films chargés · ${data.title}`);
      setRecent((previous) => {
        const next = [
          { url: data.source, title: data.title, count: data.films.length },
          ...previous.filter((item) => item.url !== data.source),
        ].slice(0, 8);
        try {
          localStorage.setItem(HISTORY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      });
      if (updateAddress) {
        const address = new URL(window.location.href);
        if (data.source === initialSnapshot.source) address.searchParams.delete("list");
        else address.searchParams.set("list", data.source);
        window.history.pushState({ list: data.source }, "", address);
      }
    },
    [initialSnapshot.source, resetFilters],
  );

  const loadList = useCallback(
    async (url: string, force = false, updateAddress = true) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setLoadError(false);
      setLoadStatus("Lecture de la liste Letterboxd…");
      try {
        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, force }),
        });
        let payload = (await response.json()) as {
          state?: string;
          snapshot?: Snapshot;
          jobId?: string;
          done?: number;
          total?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Import impossible.");
        if (payload.state === "done" && payload.snapshot) {
          applySnapshot(payload.snapshot, updateAddress);
          return;
        }
        if (!payload.jobId) throw new Error("L'import n'a pas démarré.");
        const jobId = payload.jobId;
        for (;;) {
          await new Promise((resolve) => window.setTimeout(resolve, 800));
          const progressResponse = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
          payload = await progressResponse.json();
          if (!progressResponse.ok) throw new Error(payload.error || "Import introuvable.");
          if (payload.state === "done" && payload.snapshot) {
            applySnapshot(payload.snapshot, updateAddress);
            return;
          }
          if (payload.state === "error")
            throw new Error(payload.error || "La liste n'a pas pu être chargée.");
          setLoadStatus(
            payload.total
              ? `Analyse des films : ${payload.done} / ${payload.total}…`
              : "Lecture de la liste Letterboxd…",
          );
        }
      } catch (error) {
        setLoadError(true);
        setLoadStatus(
          error instanceof Error ? error.message : "Impossible de charger cette liste.",
        );
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS) || "{}") as Saved;
        if (Array.isArray(saved.owned)) setOwnedIds(saved.owned);
        if (saved.sort) setSort(saved.sort);
        if (saved.view === "list") setView("list");
        setIncludeRental(Boolean(saved.includeRental));
        const history = JSON.parse(localStorage.getItem(HISTORY) || "[]") as RecentList[];
        if (Array.isArray(history)) setRecent(history);
      } catch {
        /* private mode */
      }
      const url = new URL(window.location.href).searchParams.get("list");
      if (url && url !== initialSnapshot.source) void loadList(url, false, false);
    });
  }, [initialSnapshot.source, loadList]);

  useEffect(() => {
    const handler = () => {
      const url = new URL(window.location.href).searchParams.get("list");
      if (url && url !== snapshot.source) void loadList(url, false, false);
      else if (!url && snapshot.source !== initialSnapshot.source)
        applySnapshot(initialSnapshot, false);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [snapshot.source, initialSnapshot, loadList, applySnapshot]);

  function saveSettings(next: {
    owned?: string[];
    sort?: Sort;
    view?: "grid" | "list";
    includeRental?: boolean;
  }) {
    const saved = {
      owned: next.owned || ownedIds,
      sort: next.sort || sort,
      view: next.view || view,
      includeRental: next.includeRental ?? includeRental,
    };
    try {
      localStorage.setItem(SETTINGS, JSON.stringify(saved));
    } catch {
      /* private mode */
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#haut" aria-label="Tonight’s Movie, accueil">
            <span className="brand-mark" aria-hidden="true">
              T<span>·</span>M
            </span>
            <span>
              tonight’s <strong>movie</strong>
            </span>
          </a>
          <span className="header-caption">LE BON FILM, AU BON ENDROIT</span>
          <button className="header-action" type="button" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal size={17} />
            <span>Mes plateformes</span>
          </button>
        </div>
      </header>
      <main id="haut" className="shell">
        <section className="intro" aria-labelledby="pageTitle">
          <div>
            <span className="intro-eyebrow">VOTRE SÉANCE COMMENCE ICI</span>
            <h1 id="pageTitle">
              Ce soir, on regarde <em>quoi ?</em>
            </h1>
            <p>
              Parcourez vos listes Letterboxd, trouvez où voir chaque film en France et laissez le
              dé décider si besoin.
            </p>
            <a className="intro-link" href="#films">
              Voir les {snapshot.films.length} films <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="intro-note">
            <span>
              <span className="intro-note-label">À L’AFFICHE EN CE MOMENT</span>
              <a href={snapshot.source} target="_blank" rel="noopener noreferrer">
                {snapshot.title}
              </a>
              <small>
                {snapshot.films.length} films · données du{" "}
                <strong>
                  {new Date(snapshot.updatedAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Europe/Paris",
                  })}
                </strong>
              </small>
            </span>
          </div>
        </section>
        <ProfilePicker
          currentSource={snapshot.source}
          recent={recent}
          loading={loading}
          loadStatus={loadStatus}
          loadError={loadError}
          onChoose={(url) => void loadList(url)}
          onRefresh={() => void loadList(snapshot.source, true)}
          onClearHistory={() => {
            setRecent([]);
            try {
              localStorage.setItem(HISTORY, "[]");
            } catch {}
          }}
        />
        <DrawPanel
          key={snapshot.source}
          films={snapshot.films}
          source={snapshot.source}
          owned={owned}
          includeRental={includeRental}
        />
        <nav className="category-nav" aria-label="Catégories de disponibilité">
          {CATEGORY_ORDER.filter((item) => item !== "unknown" || counts.unknown > 0).map((item) => (
            <button
              className={`category-tab ${category === item ? "active" : ""}`}
              type="button"
              key={item}
              aria-current={category === item ? "page" : undefined}
              onClick={() => setCategory(item)}
            >
              <span>{CATEGORY_LABELS[item]}</span>
              <strong>{counts[item]}</strong>
            </button>
          ))}
        </nav>
        <div className="workspace">
          <aside className="filters" aria-label="Filtres">
            <div className="filter-heading">
              <h2>Affiner</h2>
              <button type="button" onClick={resetFilters}>
                Effacer
              </button>
            </div>
            <label className="field-label" htmlFor="providerFilter">
              Plateforme
            </label>
            <div className="select-wrap">
              <select
                id="providerFilter"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="">Toutes les plateformes</option>
                {providerOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <label className="field-label" htmlFor="durationFilter">
              Durée maximale
            </label>
            <div className="select-wrap">
              <select
                id="durationFilter"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <option value="">Toutes les durées</option>
                <option value="90">1 h 30 ou moins</option>
                <option value="120">2 h ou moins</option>
                <option value="150">2 h 30 ou moins</option>
                <option value="180">3 h ou moins</option>
              </select>
            </div>
            <label className="field-label" htmlFor="ratingFilter">
              Note Letterboxd minimale
            </label>
            <div className="select-wrap">
              <select
                id="ratingFilter"
                value={rating}
                onChange={(event) => setRating(event.target.value)}
              >
                <option value="">Toutes les notes</option>
                <option value="4.5">4,5 et plus</option>
                <option value="4">4 et plus</option>
                <option value="3.5">3,5 et plus</option>
              </select>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={includeRental}
                onChange={(event) => {
                  setIncludeRental(event.target.checked);
                  saveSettings({ includeRental: event.target.checked });
                }}
              />
              <span>Inclure location et achat</span>
            </label>
            <p className="filter-hint">
              Une location Prime Video n’est pas incluse dans l’abonnement Prime. Activez cette
              option pour la voir parmi les autres offres.
            </p>
            <div className="filter-foot">
              <span className="filter-foot-title">VOS ACCÈS ACTUELS</span>
              <div id="ownedSummary">
                {ownedIds.length ? (
                  ownedIds.map((id) => {
                    const preset = PRESETS.find((item) => item.id === id);
                    const name = preset?.name || providers[id]?.name || id;
                    return (
                      <span className="owned-pill" key={id}>
                        <PlatformIcon provider={providers[preset?.iconId || id]} name={name} />
                        {name}
                      </span>
                    );
                  })
                ) : (
                  <span className="filter-hint">Aucune plateforme sélectionnée</span>
                )}
              </div>
              <button type="button" onClick={() => setSettingsOpen(true)}>
                Modifier mes plateformes ↗
              </button>
            </div>
          </aside>
          <section id="films" className="results" aria-label="Films">
            <div className="toolbar">
              <div className="search-wrap">
                <Search size={17} />
                <label className="sr-only" htmlFor="searchInput">
                  Rechercher un film
                </label>
                <input
                  id="searchInput"
                  type="search"
                  placeholder="Rechercher un film…"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="toolbar-right">
                <label className="sort-label" htmlFor="sortSelect">
                  Trier par
                </label>
                <div className="select-wrap sort-select">
                  <select
                    id="sortSelect"
                    value={sort}
                    onChange={(event) => {
                      const value = event.target.value as Sort;
                      setSort(value);
                      saveSettings({ sort: value });
                    }}
                  >
                    <option value="rank">Ordre de la liste</option>
                    <option value="rating-desc">Note : meilleure d’abord</option>
                    <option value="rating-asc">Note : plus basse d’abord</option>
                    <option value="runtime-asc">Durée : plus court d’abord</option>
                    <option value="runtime-desc">Durée : plus long d’abord</option>
                    <option value="platform">Plateforme : A à Z</option>
                    <option value="title">Titre : A à Z</option>
                    <option value="year-desc">Année : récente d’abord</option>
                    <option value="year-asc">Année : ancienne d’abord</option>
                  </select>
                </div>
                <div className="view-switch" role="group" aria-label="Mode d’affichage">
                  <button
                    className={view === "grid" ? "active" : ""}
                    type="button"
                    aria-label="Vue mosaïque"
                    aria-pressed={view === "grid"}
                    onClick={() => {
                      setView("grid");
                      saveSettings({ view: "grid" });
                    }}
                  >
                    <Grid2X2 size={17} />
                  </button>
                  <button
                    className={view === "list" ? "active" : ""}
                    type="button"
                    aria-label="Vue liste"
                    aria-pressed={view === "list"}
                    onClick={() => {
                      setView("list");
                      saveSettings({ view: "list" });
                    }}
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
            </div>
            <div className="result-bar">
              <span id="resultCount" role="status" aria-live="polite">
                {filtered.length} film{filtered.length > 1 ? "s" : ""} affiché
                {filtered.length > 1 ? "s" : ""}
              </span>
              <span id="categoryDescription">
                {category === "all" ? "Classement original de la liste" : categoryText(category)}
              </span>
            </div>
            {filtered.length ? (
              <div className={`film-grid ${view === "list" ? "list-view" : ""}`}>
                {filtered.map((film) => (
                  <FilmCard
                    key={film.letterboxdUrl}
                    film={film}
                    category={categoryOf(film, includeRental, owned)}
                    owned={owned}
                    includeRental={includeRental}
                    view={view}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>Aucun film trouvé</h2>
                <p>Essayez un autre titre ou retirez un filtre.</p>
                <button type="button" onClick={resetFilters}>
                  Effacer les filtres
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <span>tonight’s movie</span>
          <p>
            Films et notes :{" "}
            <a href="https://letterboxd.com/" target="_blank" rel="noopener noreferrer">
              Letterboxd
            </a>
            . Offres françaises et affiches :{" "}
            <a href="https://www.justwatch.com/fr" target="_blank" rel="noopener noreferrer">
              JustWatch
            </a>
            . Site indépendant.
          </p>
        </div>
      </footer>
      <PlatformDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        owned={owned}
        providers={providers}
        onSave={(next) => {
          const values = [...next];
          setOwnedIds(values);
          saveSettings({ owned: values });
        }}
      />
    </>
  );
}
