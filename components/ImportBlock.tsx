"use client";

import { Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ExportGuide } from "@/components/ExportGuide";
import { useI18n } from "@/components/I18nProvider";
import {
  describeImportError,
  importExport,
  recheckFilms,
  listUnsureFilms,
  summarizeLibrary,
  type ImportOutcome,
  type ImportProgress,
} from "@/lib/import/apply";
import { onReset } from "@/lib/storage";
import { library } from "@/lib/storage/library";
import type { StoredFilm, StoredList } from "@/lib/storage/schema";

type Stored = ImportOutcome & { unsure: StoredFilm[] };

const snapshot = (films: StoredFilm[], lists: StoredList[]): Stored | null =>
  films.length > 0 ? { ...summarizeLibrary(films, lists), unsure: listUnsureFilms(films) } : null;

export function ImportBlock() {
  const ids = useId();
  const { t } = useI18n();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stored, setStored] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void Promise.all([library.getFilms(), library.getLists()]).then(
        ([films, lists]) => alive && setStored(snapshot(films, lists)),
      );
    load();
    const stop = onReset(() => {
      setError(null);
      load();
    });
    return () => {
      alive = false;
      stop();
      running.current?.abort();
    };
  }, []);

  async function refresh() {
    const [films, lists] = await Promise.all([library.getFilms(), library.getLists()]);
    setStored(snapshot(films, lists));
  }

  async function recheck() {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setError(null);
    setProgress({ phase: "reading" });
    try {
      await recheckFilms(library, {
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setProgress(next);
        },
      });
      if (!controller.signal.aborted) await refresh();
    } catch (reason) {
      if (!controller.signal.aborted) setError(describeImportError(reason, t));
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
    setProgress({ phase: "reading" });
    try {
      await importExport(file, library, {
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setProgress(next);
        },
      });
      if (!controller.signal.aborted) await refresh();
    } catch (reason) {
      if (!controller.signal.aborted) setError(describeImportError(reason, t));
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  function progressLabel(current: ImportProgress) {
    return current.phase === "reading"
      ? t.import.reading
      : t.import.matching(current.done, current.total);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start(event.dataTransfer.files[0]);
  }

  const busy = progress !== null;
  const unsure = stored?.stats.toCheck ?? 0;

  return (
    <section className="import" aria-labelledby={`${ids}-title`}>
      <div className="import-head">
        <h2 id={`${ids}-title`}>{t.import.title}</h2>
        <ExportGuide />
      </div>
      <p>{t.import.optional}</p>
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
          <span>{t.import.drop}</span>
          <span className="dropzone-action">{t.import.dropAction}</span>
        </label>
      </div>
      <p id={`${ids}-privacy`} className="import-privacy">
        {t.import.privacy}
      </p>
      <div role="status" className="import-status">
        {progress && (
          <>
            <span>{progressLabel(progress)}</span>
            <progress
              aria-label={t.import.progress}
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
          <p>{t.import.unsure(unsure)}</p>
          <button type="button" className="button" onClick={() => void recheck()}>
            {t.import.recheck}
          </button>
          <details className="import-unsure">
            <summary>{t.import.unsureList}</summary>
            <ul>
              {stored?.unsure.map((film) => (
                <li key={film.key}>
                  {film.title}
                  {film.year !== null && <span> ({film.year})</span>}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {stored && !busy && (
        <div className="import-summary" role="status">
          <h3>{t.import.done}</h3>
          <dl className="import-figures">
            <div>
              <dt>{t.import.films}</dt>
              <dd>{stored.summary.total}</dd>
            </div>
            <div>
              <dt>{t.import.watchlist}</dt>
              <dd>{stored.summary.watchlist}</dd>
            </div>
            <div>
              <dt>{t.import.lists}</dt>
              <dd>{stored.summary.lists}</dd>
            </div>
            <div>
              <dt>{t.import.likes}</dt>
              <dd>{stored.summary.liked}</dd>
            </div>
            <div>
              <dt>{t.import.seen}</dt>
              <dd>{stored.summary.seen}</dd>
            </div>
          </dl>
          <p>
            {t.import.usable(stored.stats.drawable)}
            {stored.stats.toCheck > 0 && t.import.toCheck(stored.stats.toCheck)}
          </p>
        </div>
      )}
    </section>
  );
}
