"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { FilmOffers } from "@/components/FilmOffers";
import { FilmPoster } from "@/components/FilmPoster";
import { formatMinutes, formatRating } from "@/lib/catalog";
import { drawFilm, effectiveSources } from "@/lib/draw";
import { collectSwapPosters, createDrawClient } from "@/lib/draw-client";
import {
  buildDrawInput,
  drawReducer,
  durationLabel,
  durationOptions,
  noneMessage,
  roomLight,
  sourceOptions,
  swapDelays,
  watchLinks,
} from "@/lib/draw-state";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import { DEFAULT_SETTINGS, type Settings, type StoredList } from "@/lib/storage/schema";
import { loadSettings, recordDraw, updateSettings } from "@/lib/storage/settings";
import type { MovieDetails } from "@/lib/types";

const NEUTRAL_MS = 600;
const POSTER_WAIT_MS = 1200;
const WINNER_HOLD_MS = 1000;
// Pace of the poster flashes while the scan is still collecting films after the opening spin.
const SCAN_SWAP_MS = 300;
const MANY_SOURCES = "many";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function preload(src: string) {
  const loaded = new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
  return Promise.race([loaded, wait(POSTER_WAIT_MS)]);
}

type Slot = { poster: string | null; framed: boolean };

export function DrawMachine() {
  const ids = useId();
  const [state, dispatch] = useReducer(drawReducer, { phase: "idle" });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [hasSeen, setHasSeen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slot, setSlot] = useState<Slot>({ poster: null, framed: false });
  const [screening, setScreening] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const watchRef = useRef<HTMLButtonElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    async function refresh() {
      const [savedLists, films] = await Promise.all([library.getLists(), library.getFilms()]);
      if (!alive.current) return;
      setSettings(loadSettings());
      setLists(savedLists);
      setHasSeen(films.some((film) => film.seen));
      setLoaded(true);
    }
    void refresh();
    const stop = onReset(() => void refresh());
    return () => {
      alive.current = false;
      stop();
    };
  }, []);

  // Moves focus to the outcome once a draw settles, so keyboard users land on it.
  const settled = state.phase === "result" || state.phase === "none" || state.phase === "error";
  useEffect(() => {
    if (settled) headingRef.current?.focus({ preventScroll: true });
  }, [settled, state]);

  const drawing = state.phase === "drawing";
  useEffect(() => {
    if (!drawing) return;
    const room = roomRef.current;
    const poster = slotRef.current;
    function place() {
      if (!room || !poster || window.innerWidth <= 900) {
        poster?.style.setProperty("--shift", "0px");
        return;
      }
      const shift = (room.clientWidth - poster.offsetWidth) / 2 - poster.offsetLeft;
      poster.style.setProperty("--shift", `${shift}px`);
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [drawing, slot.poster, slot.framed]);

  function change(patch: Partial<Settings>) {
    setSettings(updateSettings(patch));
  }

  const closeScreening = useCallback(() => {
    setScreening(false);
  }, []);

  const screeningWasOpen = useRef(false);
  useEffect(() => {
    if (screeningWasOpen.current && !screening) watchRef.current?.focus({ preventScroll: true });
    screeningWasOpen.current = screening;
  }, [screening]);

  async function run() {
    if (running.current) return;
    running.current = true;
    setScreening(false);
    dispatch({ type: "start" });
    setSlot({ poster: null, framed: false });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const [films, savedLists] = await Promise.all([library.getFilms(), library.getLists()]);
      const input = buildDrawInput(
        loadSettings(),
        films,
        savedLists,
        state.phase === "result" ? state.film : null,
      );
      const client = createDrawClient();
      const drawingPromise = drawFilm(input, client.deps);
      let scanned = false;
      void drawingPromise.then(() => {
        scanned = true;
      });

      if (reduced) await wait(NEUTRAL_MS);
      else {
        const posters = await Promise.race([
          collectSwapPosters(input, client.deps),
          wait(POSTER_WAIT_MS).then(() => [] as string[]),
        ]);
        await Promise.all(posters.map(preload));
        let last: string | null = null;
        const swap = async (delay: number) => {
          const choices = posters.filter((poster) => poster !== last);
          last = choices[Math.floor(Math.random() * choices.length)] ?? null;
          setSlot({ poster: last, framed: false });
          await wait(delay);
        };
        for (const delay of swapDelays()) {
          if (!alive.current) return;
          await swap(delay);
        }
        // A long list is scanned in parallel batches: keep the screen moving until it settles.
        while (!scanned && alive.current) await swap(SCAN_SWAP_MS);
      }

      const result = await drawingPromise;
      if (!alive.current) return;
      if (result.status === "none") {
        dispatch(client.isOutage() ? { type: "fail" } : { type: "none", reason: result.reason });
        return;
      }
      if (!reduced) {
        if (result.film.poster) await preload(result.film.poster);
        setSlot({ poster: result.film.poster, framed: true });
        await wait(WINNER_HOLD_MS);
        if (!alive.current) return;
      }
      setSettings(recordDraw(result.key));
      dispatch({ type: "found", film: result.film, key: result.key });
    } catch {
      if (alive.current) dispatch({ type: "fail" });
    } finally {
      running.current = false;
    }
  }

  const services = new Set(settings.services);
  const sources = effectiveSources(settings.sources, lists);
  const sourceValue = sources.length === 1 ? sources[0] : MANY_SOURCES;
  const showPoster = drawing || state.phase === "result";

  const announcement = {
    idle: "",
    drawing: "Tirage en cours…",
    result:
      state.phase === "result"
        ? `Film tiré : ${state.film.title}${state.film.year ? `, ${state.film.year}` : ""}.`
        : "",
    none: state.phase === "none" ? noneMessage(state.reason).reason : "",
    error: "Le tirage a échoué.",
  }[state.phase];

  return (
    <div className="draw-page" data-phase={state.phase} data-room={roomLight(state.phase)}>
      <div className="ambient" aria-hidden="true" />
      <div className="draw-room" ref={roomRef}>
        <div
          ref={slotRef}
          className={`poster-slot${drawing && slot.framed ? " is-framed" : ""}${drawing ? " is-drawing" : ""}`}
          aria-hidden={drawing || !showPoster ? "true" : undefined}
        >
          {drawing ? (
            slot.poster ? (
              // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters.
              <img src={slot.poster} alt="" width={342} height={513} />
            ) : (
              <span className="poster-missing">Tirage en cours</span>
            )
          ) : state.phase === "result" ? (
            <FilmPoster title={state.film.title} poster={state.film.poster} />
          ) : null}
        </div>

        <div className="draw-side">
          {state.phase === "result" && !drawing && (
            <Result
              film={state.film}
              services={services}
              headingRef={headingRef}
              watchRef={watchRef}
              onWatch={() => setScreening(true)}
            />
          )}
          {state.phase === "none" && (
            <div className="draw-outcome">
              <h1 tabIndex={-1} ref={headingRef} className="title-stack none-frame">
                <span>Rien à proposer</span>
              </h1>
              <p>{noneMessage(state.reason).reason}</p>
              <p>{noneMessage(state.reason).hint}</p>
            </div>
          )}
          {state.phase === "error" && (
            <div className="draw-outcome">
              <h1 tabIndex={-1} ref={headingRef} className="title-stack">
                <span>Tirage impossible</span>
              </h1>
              <p>Impossible de joindre TMDB pour le moment. Vérifiez votre connexion.</p>
            </div>
          )}
          {(state.phase === "idle" || drawing) && (
            <div className="draw-outcome">
              <h1 className="title-stack is-in">
                <span>Qu’est-ce qu’on</span>
                <span className="title-accent">regarde ce soir ?</span>
              </h1>
              <p className="draw-lead">
                Un film, tiré au sort parmi ceux que vous pouvez regarder ce soir.
              </p>
              <button
                type="button"
                className={`button primary draw-trigger${drawing ? " is-away" : ""}`}
                disabled={drawing}
                aria-hidden={drawing ? "true" : undefined}
                onClick={() => void run()}
              >
                Tirer un film
              </button>
            </div>
          )}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>

      <div
        className="draw-player"
        role="group"
        aria-label="Réglages du tirage"
        data-pending={loaded ? undefined : ""}
      >
        <div className="filter">
          <label htmlFor={`${ids}-source`}>Source</label>
          <select
            className="select"
            id={`${ids}-source`}
            value={sourceValue}
            onChange={(event) => change({ sources: [event.target.value] })}
          >
            {sourceValue === MANY_SOURCES && (
              <option value={MANY_SOURCES} disabled>
                Plusieurs sources
              </option>
            )}
            {sourceOptions(lists).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter">
          <label htmlFor={`${ids}-duration`}>Durée maximale</label>
          <select
            className="select"
            id={`${ids}-duration`}
            value={settings.maxDuration ?? ""}
            onChange={(event) =>
              change({ maxDuration: event.target.value ? Number(event.target.value) : null })
            }
          >
            <option value="">Sans limite</option>
            {durationOptions(settings.maxDuration).map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
              </option>
            ))}
          </select>
        </div>
        {hasSeen && (
          <div className="check">
            <input
              id={`${ids}-seen`}
              type="checkbox"
              checked={settings.excludeSeen}
              onChange={(event) => change({ excludeSeen: event.target.checked })}
            />
            <label htmlFor={`${ids}-seen`}>Masquer les films déjà vus</label>
          </div>
        )}
        {state.phase !== "idle" && !drawing && (
          <button type="button" className="button draw-go" onClick={() => void run()}>
            Relancer
          </button>
        )}
      </div>

      {screening && state.phase === "result" && (
        <Screening film={state.film} services={services} onClose={closeScreening} />
      )}
    </div>
  );
}

function Result({
  film,
  services,
  headingRef,
  watchRef,
  onWatch,
}: {
  film: MovieDetails;
  services: ReadonlySet<string>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  watchRef: React.RefObject<HTMLButtonElement | null>;
  onWatch: () => void;
}) {
  return (
    <article className="result">
      <h1 tabIndex={-1} ref={headingRef} className="title-stack is-in">
        <span>{film.title}</span>
        {film.year && <span className="title-accent">{film.year}</span>}
      </h1>
      <dl className="result-figures">
        <div>
          <dt>Durée</dt>
          <dd>{formatMinutes(film.runtime)}</dd>
        </div>
        <div>
          <dt>Note TMDB</dt>
          <dd>{formatRating(film.rating)}</dd>
        </div>
      </dl>
      <FilmOffers film={film} services={services} />
      <Synopsis key={film.tmdbId} text={film.overview || "Synopsis indisponible."} />
      <button type="button" className="button primary" ref={watchRef} onClick={onWatch}>
        Regarder ce film
      </button>
      <p className="result-escape">
        Pas ce qui vous convient ? <Link href="/films">Parcourir les films</Link>
      </p>
    </article>
  );
}

function Synopsis({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const id = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    function measure() {
      if (node && !open) setClamped(node.scrollHeight > node.clientHeight + 1);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, open]);

  return (
    <div className="result-synopsis">
      <p id={id} ref={ref} className={open ? undefined : "is-clamped"}>
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          className="link-button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}

function Screening({
  film,
  services,
  onClose,
}: {
  film: MovieDetails;
  services: ReadonlySet<string>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lightsRef = useRef<HTMLButtonElement>(null);
  const where = watchLinks(film, services);

  useEffect(() => {
    const inertRoots = [
      document.querySelector(".site-header"),
      document.querySelector(".site-footer"),
      document.querySelector(".draw-room"),
      document.querySelector(".draw-player"),
    ].filter((node): node is HTMLElement => node instanceof HTMLElement);
    for (const node of inertRoots) node.setAttribute("inert", "");
    lightsRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [
        ...(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ??
          []),
      ];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const node of inertRoots) node.removeAttribute("inert");
    };
  }, [onClose]);

  return (
    <div className="cinema" ref={panelRef} role="dialog" aria-modal="true" aria-label="Séance">
      <div className="cinema-screen">
        <FilmPoster title={film.title} poster={film.poster} />
      </div>
      <div className="cinema-bar">
        <h2>Bonne séance</h2>
        <p>
          {film.title}
          {film.runtime ? ` · ${formatMinutes(film.runtime)}` : ""}
        </p>
        {where.verified ? (
          <div className="cinema-links">
            {where.links.map((link, index) => (
              <a
                key={link.id}
                className={index === 0 ? "button primary" : "button"}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {index === 0 ? `Regarder sur ${link.name}` : link.name}
              </a>
            ))}
          </div>
        ) : (
          <p className="tag-check">
            <span className="tag">À vérifier</span>
            {film.offersUrl && (
              <>
                {" "}
                <a href={film.offersUrl} target="_blank" rel="noopener noreferrer">
                  Voir la disponibilité sur TMDB (nouvel onglet)
                </a>
              </>
            )}
          </p>
        )}
        <button type="button" className="button" ref={lightsRef} onClick={onClose}>
          Rallumer les lumières
        </button>
      </div>
    </div>
  );
}
