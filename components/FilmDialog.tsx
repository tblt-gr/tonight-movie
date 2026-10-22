"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CardFilm } from "@/components/FilmCard";
import { FilmOffers } from "@/components/FilmOffers";
import { FilmPoster } from "@/components/FilmPoster";
import { useI18n } from "@/components/I18nProvider";
import { cachedDetails, fetchDetails } from "@/lib/browse-client";
import { formatMinutes, formatRating } from "@/lib/catalog";
import type { MovieDetails } from "@/lib/types";

type Loaded = { id: string; detail: MovieDetails | "failed" };

export function FilmDialog({
  film,
  services,
  region,
  onClose,
  opener,
}: {
  film: CardFilm;
  services: ReadonlySet<string>;
  /** Country of the offers. */
  region: string;
  onClose: () => void;
  /** The card that opened the dialog, focused again on close. */
  opener: React.RefObject<HTMLElement | null>;
}) {
  const { lang, t } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { tmdbId } = film;

  useEffect(() => {
    if (tmdbId === null || cachedDetails(tmdbId, lang, region)) return;
    const controller = new AbortController();
    fetchDetails(tmdbId, controller.signal, lang, region)
      .then((detail) => setLoaded({ id: film.id, detail }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: film.id, detail: "failed" });
      });
    return () => controller.abort();
  }, [film.id, tmdbId, lang, region]);

  const known = tmdbId === null ? undefined : cachedDetails(tmdbId, lang, region);
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
            <FilmPoster
              title={film.title}
              poster={detail?.poster ?? film.poster}
              alt={t.common.posterOf(film.title)}
            />
          </div>
          <div className="film-dialog-info">
            <Dialog.Title className="dialog-title">
              {film.title}
              {film.year && <span className="result-year"> ({film.year})</span>}
            </Dialog.Title>
            <dl className="result-figures">
              <div>
                <dt>{t.common.duration}</dt>
                <dd>{formatMinutes(runtime, t)}</dd>
              </div>
              <div>
                <dt>{t.common.tmdbRating}</dt>
                <dd>{formatRating(rating, t)}</dd>
              </div>
            </dl>
            <Dialog.Description className="result-synopsis">
              {waiting
                ? t.dialog.loading
                : detail?.overview || (tmdbId === null ? t.dialog.unmatched : t.draw.noSynopsis)}
            </Dialog.Description>
            {detail ? (
              <FilmOffers film={detail} services={services} directLinks />
            ) : (
              !waiting && (
                <p className="tag-check">
                  <span className="tag">{t.common.toCheck}</span> {t.offers.unconfirmed}
                </p>
              )
            )}
          </div>
          <Dialog.Close className="button">{t.common.close}</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label={t.common.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
