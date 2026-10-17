"use client";

import { useMemo, useState } from "react";
import { Dice5 } from "lucide-react";
import {
  categoryOf,
  collator,
  formatMinutes,
  GENRE_NAMES,
  relevantOffers,
  STREAM_TYPES,
} from "@/lib/catalog";
import { OfferChips } from "./FilmCard";
import type { Film } from "@/lib/types";

const STORAGE = "tonights-movie-draw-history-v1";

function readHistory(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

function randomIndex(length: number): number {
  const value = new Uint32Array(1);
  const ceiling = Math.floor(0x100000000 / length) * length;
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= ceiling);
  return value[0] % length;
}

export function DrawPanel({
  films,
  source,
  owned,
  includeRental,
}: {
  films: Film[];
  source: string;
  owned: Set<string>;
  includeRental: boolean;
}) {
  const [scope, setScope] = useState("mine");
  const [duration, setDuration] = useState("");
  const [genre, setGenre] = useState("");
  const [rating, setRating] = useState("");
  const [provider, setProvider] = useState("");
  const [avoidRecent, setAvoidRecent] = useState(true);
  const [result, setResult] = useState<Film | null>(null);
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);
  const [rolling, setRolling] = useState(false);
  const genres = useMemo(
    () =>
      [...new Set(films.flatMap((film) => film.genres || []))].sort((a, b) =>
        collator.compare(GENRE_NAMES[a] || a, GENRE_NAMES[b] || b),
      ),
    [films],
  );
  const providers = useMemo(
    () =>
      [
        ...new Map(
          films.flatMap((film) =>
            relevantOffers(film, includeRental, owned)
              .filter((offer) => STREAM_TYPES.has(offer.type))
              .map((offer) => [offer.id, offer.name] as const),
          ),
        ).entries(),
      ].sort((a, b) => collator.compare(a[1], b[1])),
    [films, includeRental, owned],
  );

  function draw() {
    const eligible = films.filter((film) => {
      if (scope !== "all" && categoryOf(film, includeRental, owned) !== scope) return false;
      if (duration && (!film.runtime || film.runtime > Number(duration))) return false;
      if (rating && (!film.rating || film.rating < Number(rating))) return false;
      if (genre && !film.genres.includes(genre)) return false;
      if (
        provider &&
        !relevantOffers(film, includeRental, owned).some(
          (offer) => offer.id === provider && STREAM_TYPES.has(offer.type),
        )
      )
        return false;
      return true;
    });
    const history = readHistory();
    const recent = Array.isArray(history[source]) ? history[source].slice(0, 5) : [];
    const fresh = avoidRecent
      ? eligible.filter((film) => !recent.includes(film.letterboxdUrl))
      : eligible;
    const candidates = fresh.length ? fresh : eligible;
    setCount(candidates.length);
    if (!candidates.length) {
      setError(true);
      setResult(null);
      return;
    }
    const pick = candidates[randomIndex(candidates.length)];
    history[source] = [
      pick.letterboxdUrl,
      ...(history[source] || []).filter((url) => url !== pick.letterboxdUrl),
    ].slice(0, 20);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(history));
    } catch {
      /* private mode */
    }
    setError(false);
    setResult(pick);
  }

  function roll() {
    setRolling(true);
    window.setTimeout(() => {
      draw();
      setRolling(false);
    }, 360);
  }

  return (
    <section className={`draw-panel ${rolling ? "rolling" : ""}`} aria-labelledby="drawTitle">
      <div className="draw-main">
        <div className="draw-icon" aria-hidden="true">
          <Dice5 size={27} />
        </div>
        <div>
          <h2 id="drawTitle">On laisse le hasard choisir ?</h2>
          <p>Un film sur vos plateformes, tiré au sort dans cette liste.</p>
        </div>
        <button type="button" onClick={roll} disabled={rolling}>
          Lancer le dé
        </button>
      </div>
      <details className="draw-details">
        <summary>
          Affiner le tirage <span aria-hidden="true">⌄</span>
        </summary>
        <div className="draw-fields">
          <label>
            Où chercher
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="mine">Mes plateformes</option>
              <option value="all">Toute la liste</option>
              <option value="other">Autres plateformes</option>
            </select>
          </label>
          <label>
            Durée maximale
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="">Peu importe</option>
              <option value="90">1 h 30</option>
              <option value="120">2 h</option>
              <option value="150">2 h 30</option>
              <option value="180">3 h</option>
            </select>
          </label>
          <label>
            Genre
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="">Tous les genres</option>
              {genres.map((item) => (
                <option value={item} key={item}>
                  {GENRE_NAMES[item] || item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note minimale
            <select value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="">Peu importe</option>
              <option value="3.5">3,5 / 5</option>
              <option value="4">4 / 5</option>
              <option value="4.5">4,5 / 5</option>
            </select>
          </label>
          <label>
            Plateforme
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">Toutes les plateformes</option>
              {providers.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="draw-check">
            <input
              type="checkbox"
              checked={avoidRecent}
              onChange={(event) => setAvoidRecent(event.target.checked)}
            />
            <span>Éviter les 5 derniers tirages</span>
          </label>
        </div>
      </details>
      {(result || error) && (
        <div className="draw-result" aria-live="polite">
          {error ? (
            <div className="draw-error">
              <strong>Aucun film pour ce tirage.</strong>Élargissez la durée, changez de genre ou
              choisissez « Toute la liste ».
            </div>
          ) : (
            result && (
              <div className="draw-pick">
                {result.poster && failedPoster !== result.poster ? (
                  // The source already provides a sized image for this small preview.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.poster}
                    alt=""
                    loading="lazy"
                    onError={() => setFailedPoster(result.poster)}
                  />
                ) : (
                  <span className="draw-poster-fallback">{result.title}</span>
                )}
                <div className="draw-pick-copy">
                  <span>
                    Le dé a choisi · {count} film{count > 1 ? "s" : ""} possibles
                  </span>
                  <a href={result.letterboxdUrl} target="_blank" rel="noopener noreferrer">
                    {result.title}
                  </a>
                  <p>
                    {result.year ?? "—"} · {formatMinutes(result.runtime)}
                    {result.rating != null && ` · ★ ${result.rating.toFixed(2).replace(".", ",")}`}
                  </p>
                  <OfferChips film={result} owned={owned} includeRental={includeRental} limit={3} />
                </div>
                <button className="draw-reroll" type="button" onClick={roll}>
                  Retirer
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
