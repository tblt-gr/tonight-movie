"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { MultiSelect } from "@/components/MultiSelect";
import { summarizeNames, validateServices } from "@/lib/services";
import { resetAll } from "@/lib/storage";
import { loadSettings, updateSettings } from "@/lib/storage/settings";
import type { ProviderInfo, ProvidersResponse } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export function ServicesPicker({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const ids = useId();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(loadSettings().services),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/providers", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ProvidersResponse>) : null))
      .then((data) => {
        if (!data) return setStatus("error");
        setProviders(data.providers);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  function change(next: ReadonlySet<string>) {
    setError(null);
    setSelected(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateServices(selected);
    setError(problem);
    if (problem) return;
    updateSettings({ services: [...selected] });
    router.push("/tirage");
  }

  function retry() {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }

  async function erase() {
    await resetAll();
    setSelected(new Set());
    setConfirming(false);
    setError(null);
  }

  const count = selected.size;
  const summary =
    count === 0
      ? "Aucun service choisi"
      : `${count} service${count > 1 ? "s" : ""} choisi${count > 1 ? "s" : ""}`;

  return (
    <>
      <form className="services" onSubmit={submit} noValidate>
        <fieldset className="services-group" aria-describedby={error ? `${ids}-error` : undefined}>
          <legend className="services-title">Vos services de streaming</legend>
          <p className="services-hint">
            Choisissez les abonnements que vous avez. Le tirage ne propose que des films disponibles
            chez eux.
          </p>
          {status === "ready" && (
            <p className="services-count" role="status">
              {summary}
            </p>
          )}
          {status === "loading" && <p role="status">Chargement des services…</p>}
          {status === "error" && (
            <div role="alert" className="services-message">
              <p>Impossible de charger la liste des services.</p>
              <button type="button" className="button ghost" onClick={retry}>
                Réessayer
              </button>
            </div>
          )}
          {status === "ready" && (
            <MultiSelect
              label="Rechercher un service"
              options={providers}
              selected={selected}
              onChange={change}
              emptyMessage={(query) => `Aucun service ne correspond à « ${query} ».`}
              removeLabel={(name) => `Retirer ${name}`}
              summary={summarizeNames(
                providers.filter((provider) => selected.has(provider.id)).map((p) => p.name),
                "Rechercher un service",
              )}
            />
          )}
        </fieldset>
        {error && (
          <p id={`${ids}-error`} className="services-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary">
          Valider
        </button>
      </form>
      {children}
      <section className="reset" aria-labelledby={`${ids}-reset`}>
        <h2 id={`${ids}-reset`}>Vos données</h2>
        <p>Efface vos services, vos listes importées et vos films vus de ce navigateur.</p>
        {confirming ? (
          <div role="alertdialog" aria-labelledby={`${ids}-confirm`} className="reset-confirm">
            <p id={`${ids}-confirm`}>Cette action est définitive. Tout effacer ?</p>
            <button type="button" className="button danger" onClick={erase}>
              Oui, tout effacer
            </button>
            <button type="button" className="button ghost" onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="button ghost" onClick={() => setConfirming(true)}>
            Effacer mes données
          </button>
        )}
      </section>
    </>
  );
}
