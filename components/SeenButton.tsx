"use client";

import { Ban, Eye } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/**
 * Sets a film aside as already seen, or brings it back. The icon names the action, not the
 * state: a crossed circle hides the film, an eye shows it again.
 */
export function SeenButton({
  seen,
  onToggle,
  withLabel = false,
}: {
  seen: boolean;
  onToggle: () => void;
  /** Shows the action as text next to the icon, where there is no thumbnail to hover. */
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  const label = seen ? t.common.unmarkSeen : t.common.markSeen;
  const Icon = seen ? Eye : Ban;
  return (
    <button
      type="button"
      className={withLabel ? "button" : `seen-button${seen ? " is-seen" : ""}`}
      title={label}
      aria-label={withLabel ? undefined : label}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" />
      {withLabel && label}
    </button>
  );
}
