"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { AdvancedFilters, type AdvancedValues } from "@/components/AdvancedFilters";
import { DrawResult } from "@/components/DrawResult";
import { FilmPoster } from "@/components/FilmPoster";
import { useI18n } from "@/components/I18nProvider";
import { drawFilm, effectiveSources } from "@/lib/draw";
import { collectSwapPosters, createDrawClient } from "@/lib/draw-client";
import { browserRegion } from "@/lib/regions";
import {
  buildDrawInput,
  countActiveFilters,
  drawReducer,
  noneMessage,
  roomLight,
  sourceOptions,
  swapDelays,
} from "@/lib/draw-state";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import { DEFAULT_SETTINGS, type Settings, type StoredList } from "@/lib/storage/schema";
import { loadSettings, recordDraw, updateSettings } from "@/lib/storage/settings";

const NEUTRAL_MS = 600;
const POSTER_WAIT_MS = 1200;
const WINNER_HOLD_MS = 1000;
// Pace of the poster flashes while the scan is still collecting films after the opening spin.
const SCAN_SWAP_MS = 300;
const MANY_SOURCES = "many";
const NO_FINE_FILTERS: Partial<Settings> = {
  minDuration: null,
  maxDuration: null,
  minRating: null,
  minYear: null,
  maxYear: null,
  genres: [],
};

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
  const { lang, t } = useI18n();
  const [state, dispatch] = useReducer(drawReducer, { phase: "idle" });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [hasSeen, setHasSeen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [slot, setSlot] = useState<Slot>({ poster: null, framed: false });
  const alive = useRef(true);
  const running = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  function changeAdvanced({ hideSeen, ...patch }: Partial<AdvancedValues>) {
    change(hideSeen === undefined ? patch : { ...patch, excludeSeen: hideSeen });
  }

  function change(patch: Partial<Settings>) {
    setSettings(updateSettings(patch));
  }

  async function run() {
    if (running.current) return;
    running.current = true;
    setMoreOpen(false);
    dispatch({ type: "start" });
    setSlot({ poster: null, framed: false });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      const [films, savedLists] = await Promise.all([library.getFilms(), library.getLists()]);
      const saved = loadSettings();
      const input = buildDrawInput(
        saved,
        films,
        savedLists,
        state.phase === "result" ? state.film : null,
      );
      const client = createDrawClient(undefined, undefined, lang, browserRegion(saved.region));
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
  const activeFilters = countActiveFilters(settings);
  const showPoster = drawing || state.phase === "result";

  const announcement = {
    idle: "",
    drawing: t.draw.drawingStatus,
    result: state.phase === "result" ? t.draw.found(state.film.title, state.film.year) : "",
    none: state.phase === "none" ? noneMessage(state.reason, t).reason : "",
    error: t.draw.failed,
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
              <span className="poster-missing">{t.draw.drawing}</span>
            )
          ) : state.phase === "result" ? (
            <FilmPoster
              title={state.film.title}
              poster={state.film.poster}
              alt={t.common.posterOf(state.film.title)}
            />
          ) : null}
        </div>

        <div className="draw-side">
          {state.phase === "result" && !drawing && (
            <DrawResult film={state.film} services={services} headingRef={headingRef} />
          )}
          {state.phase === "none" && (
            <div className="draw-outcome">
              <h1 tabIndex={-1} ref={headingRef} className="title-stack none-frame">
                <span>{t.draw.noneTitle}</span>
              </h1>
              <p>{noneMessage(state.reason, t).reason}</p>
              <p>{noneMessage(state.reason, t).hint}</p>
            </div>
          )}
          {state.phase === "error" && (
            <div className="draw-outcome">
              <h1 tabIndex={-1} ref={headingRef} className="title-stack">
                <span>{t.draw.errorTitle}</span>
              </h1>
              <p>{t.common.unreachable}</p>
            </div>
          )}
          {(state.phase === "idle" || drawing) && (
            <div className="draw-outcome">
              <h1 className="title-stack is-in">
                <span>{t.draw.idleTitle[0]}</span>
                <span className="title-accent">{t.draw.idleTitle[1]}</span>
              </h1>
              <p className="draw-lead">{t.draw.lead}</p>
              <button
                type="button"
                className={`button primary draw-trigger${drawing ? " is-away" : ""}`}
                disabled={drawing}
                aria-hidden={drawing ? "true" : undefined}
                onClick={() => void run()}
              >
                {t.draw.trigger}
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
        aria-label={t.draw.player}
        data-pending={loaded ? undefined : ""}
      >
        <div className="filter">
          <label htmlFor={`${ids}-source`}>{t.draw.source}</label>
          <select
            className="select"
            id={`${ids}-source`}
            value={sourceValue}
            onChange={(event) => change({ sources: [event.target.value] })}
          >
            {sourceValue === MANY_SOURCES && (
              <option value={MANY_SOURCES} disabled>
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
        <button
          type="button"
          className="button draw-more filters-toggle"
          aria-expanded={moreOpen}
          aria-controls={`${ids}-more`}
          onClick={() => setMoreOpen((open) => !open)}
        >
          {t.draw.filters(activeFilters)}
          <ChevronDown aria-hidden="true" />
        </button>
        {state.phase !== "idle" && !drawing && (
          <button type="button" className="button primary draw-go" onClick={() => void run()}>
            {t.draw.redraw}
          </button>
        )}
        {moreOpen && (
          <AdvancedFilters
            id={`${ids}-more`}
            className="draw-filters"
            resetClassName="draw-filters-reset"
            values={{ ...settings, hideSeen: settings.excludeSeen }}
            hasSeen={hasSeen}
            onChange={changeAdvanced}
            onReset={() => change(NO_FINE_FILTERS)}
          />
        )}
      </div>
    </div>
  );
}
