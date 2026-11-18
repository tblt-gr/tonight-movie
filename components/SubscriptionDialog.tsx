"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { DetailState } from "@/lib/browse";
import { fetchDetails } from "@/lib/browse-client";
import { rankServices } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n/config";
import { loadListOffers, type ListOffersProgress } from "@/lib/list-offers";
import { fetchSearch, resolveFilms } from "@/lib/resolve";
import { library } from "@/lib/storage/library";
import type { StoredFilm } from "@/lib/storage/schema";

/** Ranks the streaming services by the films of the source they offer, loading what is missing. */
export function SubscriptionDialog({
  films,
  services,
  details,
  failedKeys,
  lang,
  region,
  opener,
  onClose,
}: {
  films: StoredFilm[];
  /** The visitor's saved services: these get the "already subscribed" badge. */
  services: ReadonlySet<string>;
  /** Details already loaded during this visit, shared with the grid. */
  details: Map<number, DetailState>;
  failedKeys: Set<string>;
  lang: Locale;
  region: string;
  /** The button that opened the dialog, focused again on close. */
  opener: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<ListOffersProgress | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void loadListOffers({
      films,
      details,
      signal,
      onProgress: (next) => {
        if (!signal.aborted) setProgress(next);
      },
      deps: {
        resolve: async (keys) => {
          await resolveFilms(keys, library, fetchSearch(signal), {
            concurrency: 3,
            retries: 3,
            baseDelayMs: 1500,
            signal,
          });
          const wanted = new Set(keys);
          const fresh = (await library.getFilms()).filter((film) => wanted.has(film.key));
          for (const film of fresh) {
            if (film.confidence === null) failedKeys.add(film.key);
          }
          return fresh;
        },
        fetchDetail: (tmdbId, signal) => fetchDetails(tmdbId, signal, lang, region),
      },
    });
    return () => controller.abort();
  }, [films, details, failedKeys, lang, region]);

  const finished = progress !== null && progress.done === progress.total;
  const result = useMemo(
    () => (progress ? rankServices(progress.entries, services) : null),
    [progress, services],
  );
  const max = result?.ranking[0]?.count ?? 1;
  const everyLookupFailed =
    finished && result !== null && result.total > 0 && result.unknown === result.total;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog subscription-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <Dialog.Title className="dialog-title">{t.browse.subscriptions.title}</Dialog.Title>
          <Dialog.Description className="dialog-text">
            {t.browse.subscriptions.intro(progress?.total ?? films.length)}
          </Dialog.Description>
          <div role="status" className="subscription-status">
            {progress === null || !finished
              ? t.browse.subscriptions.progress(progress?.done ?? 0, progress?.total ?? 0)
              : ""}
            {finished && result?.total === 0 && t.browse.subscriptions.empty}
            {everyLookupFailed && t.browse.subscriptions.failed}
          </div>
          {result && result.ranking.length > 0 && (
            <ol className="subscription-list">
              {result.ranking.map((row) => (
                <li
                  key={row.id}
                  className="subscription-row"
                  style={{ "--share": `${(row.count / max) * 100}%` } as React.CSSProperties}
                >
                  {row.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized logos.
                    <img src={row.icon} alt="" width={28} height={28} />
                  ) : (
                    <span className="subscription-logo" aria-hidden="true" />
                  )}
                  <span className="subscription-name">
                    {row.name}
                    {row.owned && <span className="tag">{t.browse.subscriptions.owned}</span>}
                  </span>
                  <span className="subscription-count">
                    {t.browse.subscriptions.filmCount(row.count)}
                  </span>
                  <span className="subscription-bar" aria-hidden="true" />
                </li>
              ))}
            </ol>
          )}
          {finished && result && !everyLookupFailed && (
            <>
              {result.unknown > 0 && (
                <p className="dialog-text">{t.browse.subscriptions.unknown(result.unknown)}</p>
              )}
              {result.none > 0 && (
                <p className="dialog-text">{t.browse.subscriptions.none(result.none)}</p>
              )}
            </>
          )}
          <Dialog.Close className="button">{t.common.close}</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label={t.common.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
