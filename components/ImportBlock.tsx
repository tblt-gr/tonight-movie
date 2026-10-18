"use client";

import { Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ExportGuide } from "@/components/ExportGuide";
import {
  describeImportError,
  importExport,
  recheckFilms,
  unsureFilms,
  type ImportOutcome,
  type ImportProgress,
} from "@/lib/import/apply";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

function progressLabel(progress: ImportProgress) {
  return progress.phase === "reading"
    ? "Lecture du fichier…"
    : `Recherche des films : ${progress.done} sur ${progress.total}`;
}

export function ImportBlock() {
  const ids = useId();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [unsure, setUnsure] = useState(0);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const count = () =>
      void library.getFilms().then((films) => alive && setUnsure(unsureFilms(films).length));
    count();
    const stop = onReset(() => {
      setOutcome(null);
      setError(null);
      count();
    });
    return () => {
      alive = false;
      stop();
      running.current?.abort();
    };
  }, []);

  async function recheck() {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setError(null);
    setOutcome(null);
    setProgress({ phase: "reading" });
    try {
      await recheckFilms(library, {
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setProgress(next);
        },
      });
      if (!controller.signal.aborted) {
        setUnsure(unsureFilms(await library.getFilms()).length);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(describeImportError(reason));
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  async function start(file: File | undefined) {
    if (!file || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setError(null);
    setOutcome(null);
    setProgress({ phase: "reading" });
    try {
      const result = await importExport(file, library, {
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setProgress(next);
        },
      });
      if (!controller.signal.aborted) {
        setOutcome(result);
        setUnsure(result.stats.toCheck);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(describeImportError(reason));
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start(event.dataTransfer.files[0]);
  }

  const busy = progress !== null;

  return (
    <section className="import" aria-labelledby={`${ids}-title`}>
      <div className="import-head">
        <h2 id={`${ids}-title`}>Importer vos films Letterboxd</h2>
        <ExportGuide />
      </div>
      <p>
        Facultatif. Sans import, le tirage choisit parmi tous les films disponibles sur vos
        services.
      </p>
      <div
        className={dragging ? "dropzone is-dragging" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          id={`${ids}-file`}
          className="sr-only"
          type="file"
          accept=".zip,.csv"
          aria-describedby={error ? `${ids}-error` : `${ids}-privacy`}
          onChange={(event) => {
            const input = event.currentTarget;
            void start(input.files?.[0]);
            // Choosing the same file again must still trigger a change.
            input.value = "";
          }}
        />
        <label htmlFor={`${ids}-file`} className="dropzone-label">
          <Upload aria-hidden="true" />
          <span>Déposez votre archive .zip ou un fichier .csv ici</span>
          <span className="dropzone-action">ou choisissez un fichier</span>
        </label>
      </div>
      <p id={`${ids}-privacy`} className="import-privacy">
        Le fichier est lu dans votre navigateur. Rien n’est envoyé à un serveur de Tonight’s Movie.
      </p>
      <div role="status" className="import-status">
        {progress && (
          <>
            <span>{progressLabel(progress)}</span>
            <progress
              aria-label="Avancement de l’import"
              value={progress.phase === "matching" ? progress.done : undefined}
              max={progress.phase === "matching" ? progress.total : undefined}
            />
          </>
        )}
      </div>
      {error && (
        <p id={`${ids}-error`} className="services-error" role="alert">
          {error}
        </p>
      )}
      {unsure > 0 && !busy && (
        <div className="import-recheck">
          <p>
            {plural(unsure, "film n’est pas associé", "films ne sont pas associés")} avec certitude
            à TMDB : ils n’ont ni affiche ni durée et le tirage les ignore.
          </p>
          <button type="button" className="button" onClick={() => void recheck()}>
            Relancer la recherche
          </button>
        </div>
      )}
      {outcome && !busy && (
        <div className="import-summary" role="status">
          <h3>Import terminé</h3>
          <dl className="import-figures">
            <div>
              <dt>Watchlist</dt>
              <dd>{outcome.summary.watchlist}</dd>
            </div>
            <div>
              <dt>Listes</dt>
              <dd>{outcome.summary.lists}</dd>
            </div>
            <div>
              <dt>Likes</dt>
              <dd>{outcome.summary.liked}</dd>
            </div>
            <div>
              <dt>Vus</dt>
              <dd>{outcome.summary.seen}</dd>
            </div>
          </dl>
          <p>
            Le tirage peut utiliser {plural(outcome.stats.drawable, "film", "films")}.
            {outcome.stats.toCheck > 0 &&
              ` ${plural(outcome.stats.toCheck, "film est", "films sont")} à vérifier : la correspondance n’est pas certaine.`}
          </p>
        </div>
      )}
    </section>
  );
}
