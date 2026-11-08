"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Play, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { Trailer } from "@/lib/types";

/** The player is mounted only while the dialog is open: nothing reaches YouTube before the click. */
export function TrailerButton({ trailer, title }: { trailer: Trailer | null; title: string }) {
  const { t } = useI18n();
  if (!trailer) return null;
  return (
    <Dialog.Root>
      <Dialog.Trigger className="button">
        <Play aria-hidden="true" />
        {t.trailer.watch}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog trailer-dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{t.trailer.title(title)}</Dialog.Title>
          <iframe
            className="trailer-frame"
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&playsinline=1`}
            title={trailer.name ?? t.trailer.title(title)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <Dialog.Close className="icon-button dialog-x" aria-label={t.common.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
