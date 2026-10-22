"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { MultiSelect } from "@/components/MultiSelect";
import { langParam } from "@/lib/i18n/config";
import { browserRegion, regionOptions, regionParam } from "@/lib/regions";
import { summarizeNames, validateServices } from "@/lib/services";
import { resetAll } from "@/lib/storage";
import { loadSettings, updateSettings } from "@/lib/storage/settings";
import type { ProviderInfo, ProvidersResponse } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export function ServicesPicker({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const { lang, t, href } = useI18n();
  const ids = useId();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(loadSettings().services),
  );
  const [region, setRegion] = useState(() => browserRegion(loadSettings().region));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = [langParam(lang), regionParam(region)].filter(Boolean).join("&");
    fetch(`/api/providers${query ? `?${query}` : ""}`, {
      signal: controller.signal,
    })
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
  }, [attempt, lang, region]);

  function change(next: ReadonlySet<string>) {
    setError(null);
    setSelected(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateServices(selected) === "none" ? t.services.needOne : null;
    setError(problem);
    if (problem) return;
    updateSettings({ services: [...selected], region });
    router.push(href("draw"));
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
  const summary = count === 0 ? t.services.none : t.services.count(count);

  return (
    <>
      <form className="services" onSubmit={submit} noValidate>
        <fieldset className="services-group" aria-describedby={error ? `${ids}-error` : undefined}>
          <legend className="services-title">{t.services.title}</legend>
          <p className="services-hint">{t.services.hint}</p>
          {status === "ready" && (
            <p className="services-count" role="status">
              {summary}
            </p>
          )}
          {status === "loading" && <p role="status">{t.services.loading}</p>}
          {status === "error" && (
            <div role="alert" className="services-message">
              <p>{t.services.loadError}</p>
              <button type="button" className="button ghost" onClick={retry}>
                {t.common.retry}
              </button>
            </div>
          )}
          {status === "ready" && (
            <div className="filter services-country">
              <label htmlFor={`${ids}-country`}>{t.services.country}</label>
              <select
                className="select"
                id={`${ids}-country`}
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                {regionOptions(lang).map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {status === "ready" && (
            <MultiSelect
              label={t.services.searchLabel}
              options={providers}
              selected={selected}
              onChange={change}
              emptyMessage={t.services.empty}
              removeLabel={t.services.remove}
              clearLabel={t.services.clear}
              sectionLabels={{ mine: t.services.mine, others: t.services.others }}
              summary={summarizeNames(
                providers.filter((provider) => selected.has(provider.id)).map((p) => p.name),
                t.services.searchLabel,
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
          {t.services.submit}
        </button>
      </form>
      {children}
      <section className="reset" aria-labelledby={`${ids}-reset`}>
        <h2 id={`${ids}-reset`}>{t.services.dataTitle}</h2>
        <p>{t.services.dataText}</p>
        {confirming ? (
          <div role="alertdialog" aria-labelledby={`${ids}-confirm`} className="reset-confirm">
            <p id={`${ids}-confirm`}>{t.services.confirm}</p>
            <button type="button" className="button danger" onClick={erase}>
              {t.services.confirmYes}
            </button>
            <button type="button" className="button ghost" onClick={() => setConfirming(false)}>
              {t.services.cancel}
            </button>
          </div>
        ) : (
          <button type="button" className="button ghost" onClick={() => setConfirming(true)}>
            {t.services.erase}
          </button>
        )}
      </section>
    </>
  );
}
