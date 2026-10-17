"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PRESETS, collator } from "@/lib/catalog";
import { PlatformIcon } from "./PlatformIcon";
import type { Provider } from "@/lib/types";

export function PlatformDialog({
  open,
  onOpenChange,
  owned,
  providers,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owned: Set<string>;
  providers: Record<string, Provider>;
  onSave: (owned: Set<string>) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(owned));
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setDraft(new Set(owned));
        setQuery("");
      });
    }
  }, [open, owned]);
  const other = useMemo(
    () =>
      Object.entries(providers)
        .filter(
          ([id, provider]) =>
            !PRESETS.some((preset) => preset.match(id)) &&
            provider.name.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
        )
        .sort((a, b) => collator.compare(a[1].name, b[1].name)),
    [providers, query],
  );
  const presets = PRESETS.filter((preset) =>
    preset.name.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
  );
  const toggle = (id: string, checked: boolean) =>
    setDraft((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay" />
        <Dialog.Content className="radix-dialog" aria-describedby="platform-description">
          <div className="dialog-head">
            <div>
              <Dialog.Title id="platform-title">Mes plateformes</Dialog.Title>
              <Dialog.Description id="platform-description">
                Sélectionnez les abonnements que vous possédez.
              </Dialog.Description>
            </div>
            <Dialog.Close className="close-button" aria-label="Fermer">
              <X size={19} />
            </Dialog.Close>
          </div>
          <div className="settings-search">
            <label className="sr-only" htmlFor="settingsSearch">
              Rechercher une plateforme
            </label>
            <input
              id="settingsSearch"
              type="search"
              placeholder="Rechercher une plateforme…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="settings-options">
            {presets.length > 0 && (
              <>
                <div className="settings-group-title">VOS PLATEFORMES DÉCLARÉES</div>
                {presets.map((preset) => (
                  <label className="settings-item" key={preset.id}>
                    <input
                      type="checkbox"
                      checked={draft.has(preset.id)}
                      onChange={(event) => toggle(preset.id, event.target.checked)}
                    />
                    <PlatformIcon provider={providers[preset.iconId]} name={preset.name} />
                    <span>
                      {preset.name}
                      <small>{preset.note}</small>
                    </span>
                  </label>
                ))}
              </>
            )}
            {other.length > 0 && (
              <>
                <div className="settings-group-title">AUTRES SERVICES EN FRANCE</div>
                {other.map(([id, provider]) => (
                  <label className="settings-item" key={id}>
                    <input
                      type="checkbox"
                      checked={draft.has(id)}
                      onChange={(event) => toggle(id, event.target.checked)}
                    />
                    <PlatformIcon provider={provider} name={provider.name} />
                    <span>{provider.name}</span>
                  </label>
                ))}
              </>
            )}
            {!presets.length && !other.length && (
              <p className="settings-empty">Aucune plateforme trouvée.</p>
            )}
          </div>
          <div className="dialog-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onSave(draft);
                onOpenChange(false);
              }}
            >
              Enregistrer mes plateformes
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
