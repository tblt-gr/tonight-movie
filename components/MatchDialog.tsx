"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { FilmPoster } from "@/components/FilmPoster";
import { useI18n } from "@/components/I18nProvider";
import { fetchDetails } from "@/lib/browse-client";
import { factsOf } from "@/lib/enrich";
import { browserRegion } from "@/lib/regions";
import { fetchSearch } from "@/lib/resolve";
import { confirmMatch, findCandidates } from "@/lib/review";
import { library } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";
import { loadSettings } from "@/lib/storage/settings";
import type { MovieSummary } from "@/lib/types";

type Found =
  { status: "loading" } | { status: "failed" } | { status: "done"; films: MovieSummary[] };

const MANUAL_LIMIT = 6;

export function MatchDialog({
  film,
  opener,
  onClose,
  onDone,
}: {
  film: StoredFilm;
  /** The button that opened the dialog, focused again on close. */
  opener: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Called once the choice is saved. */
  onDone: () => void;
}) {
  const { lang, t } = useI18n();
  const [suggested, setSuggested] = useState<Found>({ status: "loading" });
  const [manual, setManual] = useState<Found | null>(null);
  const [title, setTitle] = useState(film.title);
  const [year, setYear] = useState(film.year === null ? "" : String(film.year));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    findCandidates(film, fetchSearch(controller.signal))
      .then((films) => setSuggested({ status: "done", films }))
      .catch(() => {
        if (!controller.signal.aborted) setSuggested({ status: "failed" });
      });
    return () => controller.abort();
  }, [film]);

  async function search(event: FormEvent) {
    event.preventDefault();
    const wanted = title.trim();
    if (!wanted) return;
    const parsed = Number.parseInt(year, 10);
    setManual({ status: "loading" });
    try {
      const films = await findCandidates(
        { title: wanted, year: Number.isFinite(parsed) ? parsed : null },
        fetchSearch(),
        MANUAL_LIMIT,
      );
      setManual({ status: "done", films });
    } catch {
      setManual({ status: "failed" });
    }
  }

  async function choose(movie: MovieSummary) {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const region = browserRegion(loadSettings().region);
      await confirmMatch(library, film, movie.tmdbId, {
        fetchFacts: (id, signal) => fetchDetails(id, signal, lang, region).then(factsOf),
      });
      onDone();
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  }

  const results = (found: Found) => {
    if (found.status === "loading") return <p role="status">{t.import.fixSearching}</p>;
    if (found.status === "failed") return <p role="alert">{t.import.fixFailed}</p>;
    if (found.films.length === 0) return <p role="status">{t.import.fixNone}</p>;
    return (
      <ul className="match-list">
        {found.films.map((movie) => (
          <li key={movie.tmdbId}>
            <button
              type="button"
              className="match-choice"
              disabled={saving}
              aria-label={t.import.fixPick(movie.title, movie.year)}
              onClick={() => void choose(movie)}
            >
              <span className="match-poster">
                <FilmPoster
                  title={movie.title}
                  poster={movie.poster}
                  alt={t.common.posterOf(movie.title)}
                />
              </span>
              <span className="match-info">
                <strong>{movie.title}</strong>
                <span>
                  {movie.year ?? "—"}
                  {movie.originalTitle && movie.originalTitle !== movie.title
                    ? ` · ${movie.originalTitle}`
                    : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog match-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <Dialog.Title className="dialog-title">{t.import.fixTitle}</Dialog.Title>
          <Dialog.Description className="dialog-text">
            {t.import.fixIntro(film.title, film.year)}
          </Dialog.Description>
          {results(suggested)}
          <form className="match-search" onSubmit={(event) => void search(event)}>
            <p className="field-label">{t.import.fixManual}</p>
            <label>
              <span className="field-label">{t.import.fixSearchTitle}</span>
              <input
                type="search"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">{t.import.fixSearchYear}</span>
              <input
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
            <button type="submit" className="button">
              {t.import.fixSearch}
            </button>
          </form>
          {manual && results(manual)}
          {saveFailed && <p role="alert">{t.import.fixSaveFailed}</p>}
          <Dialog.Close className="button">{t.common.close}</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label={t.common.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
