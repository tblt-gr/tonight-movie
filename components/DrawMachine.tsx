"use client";

import Link from "next/link";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { formatMinutes } from "@/lib/catalog";
import { drawFilm, effectiveSources } from "@/lib/draw";
import { collectSwapPosters, createDrawClient } from "@/lib/draw-client";
import {
  buildDrawInput,
  drawReducer,
  durationLabel,
  durationOptions,
  noneMessage,
  offersToShow,
  sourceOptions,
  swapDelays,
} from "@/lib/draw-state";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import { DEFAULT_SETTINGS, type Settings, type StoredList } from "@/lib/storage/schema";
import { loadSettings, recordDraw, updateSettings } from "@/lib/storage/settings";
import type { MovieDetails } from "@/lib/types";

const NEUTRAL_MS = 600;
const POSTER_WAIT_MS = 1200;
const WINNER_HOLD_MS = 1000;
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

function Poster({ film }: { film: Pick<MovieDetails, "title" | "poster"> }) {
  return film.poster ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters.
    <img src={film.poster} alt={`Affiche de ${film.title}`} width={342} height={513} />
  ) : (
    <span className="poster-missing">{film.title}</span>
  );
}

export function DrawMachine() {
  const ids = useId();
  const [state, dispatch] = useReducer(drawReducer, { phase: "idle" });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<StoredList[]>([]);
  const [hasSeen, setHasSeen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slot, setSlot] = useState<Slot>({ poster: null, framed: false });
  const alive = useRef(true);
  const running = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

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
    if (settled) headingRef.current?.focus();
  }, [settled, state]);

  function change(patch: Partial<Settings>) {
    setSettings(updateSettings(patch));
  }

  async function run() {
    if (running.current) return;
    running.current = true;
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
      const drawing = drawFilm(input, client.deps);

      if (reduced) await wait(NEUTRAL_MS);
      else {
        const posters = await Promise.race([
          collectSwapPosters(input, client.deps),
          wait(POSTER_WAIT_MS).then(() => [] as string[]),
        ]);
        await Promise.all(posters.map(preload));
        let last: string | null = null;
        for (const delay of swapDelays()) {
          if (!alive.current) return;
          const choices = posters.filter((poster) => poster !== last);
          last = choices[Math.floor(Math.random() * choices.length)] ?? null;
          setSlot({ poster: last, framed: false });
          await wait(delay);
        }
      }

      const result = await drawing;
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

  const drawing = state.phase === "drawing";
  const services = new Set(settings.services);
  const sources = effectiveSources(settings.sources, lists);
  const sourceValue = sources.length === 1 ? sources[0] : MANY_SOURCES;

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
    <>
      <div className="draw-stage">
        <div
          className={`poster-slot${drawing && slot.framed ? " is-framed" : ""}${drawing ? " is-drawing" : ""}`}
          aria-hidden={drawing ? "true" : undefined}
        >
          {drawing ? (
            slot.poster ? (
              // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters.
              <img src={slot.poster} alt="" width={342} height={513} />
            ) : (
              <span className="poster-missing">Tirage en cours</span>
            )
          ) : state.phase === "result" ? (
            <Poster film={state.film} />
          ) : (
            <span className="poster-missing">Votre film du soir</span>
          )}
        </div>

        <div className="draw-side">
          {state.phase === "result" && !drawing && (
            <Result
              film={state.film}
              services={services}
              headingRef={headingRef}
              onRedraw={() => void run()}
            />
          )}
          {state.phase === "none" && (
            <div className="draw-outcome">
              <h2 tabIndex={-1} ref={headingRef}>
                Rien à proposer
              </h2>
              <p>{noneMessage(state.reason).reason}</p>
              <p>{noneMessage(state.reason).hint}</p>
              <button type="button" className="button primary" onClick={() => void run()}>
                Réessayer
              </button>
            </div>
          )}
          {state.phase === "error" && (
            <div className="draw-outcome">
              <h2 tabIndex={-1} ref={headingRef}>
                Tirage impossible
              </h2>
              <p>Impossible de joindre TMDB pour le moment. Vérifiez votre connexion.</p>
              <button type="button" className="button primary" onClick={() => void run()}>
                Réessayer
              </button>
            </div>
          )}
          {(state.phase === "idle" || drawing) && (
            <div className="draw-outcome">
              <p className="draw-lead">
                Un film, tiré au sort parmi ceux que vous pouvez regarder ce soir.
              </p>
              <button
                type="button"
                className="button primary draw-trigger"
                aria-disabled={drawing}
                onClick={() => void run()}
              >
                {drawing ? "Tirage en cours…" : "Tirer un film"}
              </button>
            </div>
          )}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>

      {loaded && (
        <fieldset className="draw-settings">
          <legend>Réglages du tirage</legend>
          <div className="field">
            <label htmlFor={`${ids}-source`}>Source</label>
            <select
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
          <div className="field">
            <label htmlFor={`${ids}-duration`}>Durée maximale</label>
            <select
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
            <div className="field field-check">
              <input
                id={`${ids}-seen`}
                type="checkbox"
                checked={settings.excludeSeen}
                onChange={(event) => change({ excludeSeen: event.target.checked })}
              />
              <label htmlFor={`${ids}-seen`}>Exclure les films déjà vus</label>
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}

function Result({
  film,
  services,
  headingRef,
  onRedraw,
}: {
  film: MovieDetails;
  services: ReadonlySet<string>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRedraw: () => void;
}) {
  const offers = offersToShow(film, services);
  const verified = film.availabilityStatus === "verified" && offers.length > 0;
  return (
    <article className="result">
      <h2 tabIndex={-1} ref={headingRef}>
        {film.title}
        {film.year && <span className="result-year"> ({film.year})</span>}
      </h2>
      <dl className="result-figures">
        <div>
          <dt>Durée</dt>
          <dd>{formatMinutes(film.runtime)}</dd>
        </div>
        <div>
          <dt>Note TMDB</dt>
          <dd>
            {film.rating === null
              ? "Pas encore notée"
              : `${film.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`}
          </dd>
        </div>
      </dl>
      <p className="result-synopsis">{film.overview || "Synopsis indisponible."}</p>
      <section aria-label="Où le regarder">
        {verified ? (
          <ul className="result-offers">
            {offers.map((offer) => {
              const href = offer.url ?? film.offersUrl;
              return (
                <li key={offer.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Regarder sur ${offer.name} (nouvel onglet)`}
                    >
                      {offer.name}
                    </a>
                  ) : (
                    <span>{offer.name}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="tag-check">
            <span className="tag">À vérifier</span>{" "}
            {film.offersUrl ? (
              <a href={film.offersUrl} target="_blank" rel="noopener noreferrer">
                Voir la disponibilité sur TMDB (nouvel onglet)
              </a>
            ) : (
              "La disponibilité n’est pas confirmée."
            )}
          </p>
        )}
      </section>
      <button type="button" className="button primary" onClick={onRedraw}>
        Relancer
      </button>
      <p className="result-escape">
        <Link href="/films">Pas ce qui vous convient ? Parcourir les films</Link>
      </p>
    </article>
  );
}
