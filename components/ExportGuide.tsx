"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export function ExportGuide() {
  const { t } = useI18n();
  const guide = t.exportGuide;
  return (
    <Dialog.Root>
      <Dialog.Trigger className="icon-button" aria-label={guide.trigger}>
        <Info aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title className="dialog-title">{guide.title}</Dialog.Title>
          <Dialog.Description className="dialog-text">{guide.intro}</Dialog.Description>
          <ol className="dialog-steps">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Dialog.Close className="button">{t.common.close}</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label={t.common.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
