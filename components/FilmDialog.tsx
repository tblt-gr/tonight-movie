"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CardFilm } from "@/components/FilmCard";
import { FilmOffers } from "@/components/FilmOffers";
import { FilmPoster } from "@/components/FilmPoster";
import { cachedDetails, fetchDetails } from "@/lib/browse-client";
import { formatMinutes, formatRating } from "@/lib/catalog";
import type { MovieDetails } from "@/lib/types";

type Loaded = { id: string; detail: MovieDetails | "failed" };

export function FilmDialog({
  film,
  services,
  onClose,
  opener,
}: {
  film: CardFilm;
  services: ReadonlySet<string>;
  onClose: () => void;
  /** The card that opened the dialog, focused again on close. */
  opener: React.RefObject<HTMLElement | null>;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { tmdbId } = film;

  useEffect(() => {
    if (tmdbId === null || cachedDetails(tmdbId)) return;
    const controller = new AbortController();
    fetchDetails(tmdbId, controller.signal)
      .then((detail) => setLoaded({ id: film.id, detail }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: film.id, detail: "failed" });
      });
    return () => controller.abort();
  }, [film.id, tmdbId]);

  const known = tmdbId === null ? undefined : cachedDetails(tmdbId);
  const state = known ?? (loaded?.id === film.id ? loaded.detail : undefined);
  const detail = typeof state === "object" ? state : null;
  const waiting = tmdbId !== null && state === undefined;
  const runtime = detail?.runtime ?? film.runtime;
  const rating = detail ? detail.rating : film.rating;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog film-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <div className="film-dialog-poster">
            <FilmPoster title={film.title} poster={detail?.poster ?? film.poster} />
          </div>
          <div className="film-dialog-info">
            <Dialog.Title className="dialog-title">
              {film.title}
              {film.year && <span className="result-year"> ({film.year})</span>}
            </Dialog.Title>
            <dl className="result-figures">
              <div>
                <dt>Durée</dt>
                <dd>{formatMinutes(runtime)}</dd>
              </div>
              <div>
                <dt>Note TMDB</dt>
                <dd>{formatRating(rating)}</dd>
              </div>
            </dl>
            <Dialog.Description className="result-synopsis">
              {waiting
                ? "Chargement de la fiche…"
                : detail?.overview ||
                  (tmdbId === null
                    ? "Synopsis indisponible : ce film n’a pas pu être associé avec certitude à TMDB."
                    : "Synopsis indisponible.")}
            </Dialog.Description>
            {detail ? (
              <FilmOffers film={detail} services={services} />
            ) : (
              !waiting && (
                <p className="tag-check">
                  <span className="tag">À vérifier</span> La disponibilité n’est pas confirmée.
                </p>
              )
            )}
          </div>
          <Dialog.Close className="button">Fermer</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label="Fermer">
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
