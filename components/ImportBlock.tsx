"use client";

import { Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ExportGuide } from "@/components/ExportGuide";
import { useI18n } from "@/components/I18nProvider";
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

export function ImportBlock() {
  const ids = useId();
  const { t } = useI18n();
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
        </div>
      )}
      {outcome && !busy && (
        <div className="import-summary" role="status">
          <h3>{t.import.done}</h3>
          <dl className="import-figures">
            <div>
              <dt>{t.import.watchlist}</dt>
              <dd>{outcome.summary.watchlist}</dd>
            </div>
            <div>
              <dt>{t.import.lists}</dt>
              <dd>{outcome.summary.lists}</dd>
            </div>
            <div>
              <dt>{t.import.likes}</dt>
              <dd>{outcome.summary.liked}</dd>
            </div>
            <div>
              <dt>{t.import.seen}</dt>
              <dd>{outcome.summary.seen}</dd>
            </div>
          </dl>
          <p>
            {t.import.usable(outcome.stats.drawable)}
            {outcome.stats.toCheck > 0 && t.import.toCheck(outcome.stats.toCheck)}
          </p>
        </div>
      )}
    </section>
  );
}
