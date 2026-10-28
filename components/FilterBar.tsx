"use client";

import { ChevronDown, LayoutGrid, List } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { AdvancedFilters } from "@/components/AdvancedFilters";
import { useI18n } from "@/components/I18nProvider";
import { MultiSelect } from "@/components/MultiSelect";
import {
  DEFAULT_FILTERS,
  SERVICE_ANY,
  sortsFor,
  type BrowseFilters,
  type BrowseMode,
  type BrowseSort,
} from "@/lib/browse";
import { sourceOptions } from "@/lib/draw-state";
import { summarizeNames } from "@/lib/services";
import type { StoredList } from "@/lib/storage/schema";
import type { ProviderInfo } from "@/lib/types";

type Props = {
  filters: BrowseFilters;
  update: (patch: Partial<BrowseFilters>) => void;
  mode: BrowseMode;
  sources: string[];
  lists: StoredList[];
  /** The visitor's saved services. */
  settingsServices: string[];
  services: ReadonlySet<string>;
  providerInfo: Map<string, ProviderInfo>;
  /** Films were imported as seen, so hiding them can change the results. */
  hasSeen: boolean;
  filtersChanged: boolean;
  onReset: () => void;
};

/** The source, search, service, sort and view controls, plus the panel of fine filters. */
export function FilterBar({
  filters,
  update,
  mode,
  sources,
  lists,
  settingsServices,
  services,
  providerInfo,
  hasSeen,
  filtersChanged,
  onReset,
}: Props) {
  const ids = useId();
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(
    () =>
      filters.maxDuration !== null ||
      filters.minDuration !== null ||
      filters.minRating !== null ||
      filters.minYear !== null ||
      filters.maxYear !== null ||
      filters.genres.length > 0,
  );

  const serviceOptions = useMemo<ProviderInfo[]>(
    () => [
      ...(mode === "lists" ? [{ id: SERVICE_ANY, name: t.browse.anyService, logo: null }] : []),
      ...settingsServices.map(
        (id) => providerInfo.get(id) ?? { id, name: t.browse.serviceFallback(id), logo: null },
      ),
      ...[...providerInfo.values()].filter((provider) => !services.has(provider.id)),
    ],
    [mode, settingsServices, providerInfo, services, t],
  );
  const serviceSelected = useMemo(
    () => new Set(filters.services.filter((id) => serviceOptions.some((o) => o.id === id))),
    [filters.services, serviceOptions],
  );
  const chosenNames = serviceOptions.filter((o) => serviceSelected.has(o.id)).map((o) => o.name);
  const servicesSummary = summarizeNames(chosenNames, t.browse.allMine);
  const sourceValue = sources.length === 1 ? sources[0] : "many";
  const advancedCount =
    (filters.maxDuration !== null ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.minDuration !== null ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0) +
    (filters.minYear !== null ? 1 : 0) +
    (filters.maxYear !== null ? 1 : 0) +
    (filters.genres.length > 0 ? 1 : 0);

  const sortOptions = sortsFor(mode);
  const sortValue = sortOptions.includes(filters.sort) ? filters.sort : DEFAULT_FILTERS.sort;

  return (
    <div className="filters" role="search">
      <div className="filter">
        <label htmlFor={`${ids}-source`}>{t.draw.source}</label>
        <select
          className="select"
          id={`${ids}-source`}
          value={sourceValue}
          onChange={(event) => update({ source: event.target.value, services: [] })}
        >
          {sourceValue === "many" && (
            <option value="many" disabled>
              {t.draw.manySources}
            </option>
          )}
          {sourceOptions(lists, t).map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      {mode === "lists" && (
        <div className="filter">
          <label htmlFor={`${ids}-q`}>{t.browse.queryLabel}</label>
          <input
            id={`${ids}-q`}
            type="search"
            value={filters.query}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
      )}
      <div className="filter filter-services">
        <MultiSelect
          label={t.browse.services}
          options={serviceOptions}
          selected={serviceSelected}
          onChange={(next) => update({ services: [...next] })}
          emptyMessage={t.services.empty}
          removeLabel={t.services.remove}
          clearLabel={t.services.clear}
          sectionLabels={{ mine: t.services.mine, others: t.services.others }}
          owned={services}
          pinnedId={SERVICE_ANY}
          summary={servicesSummary}
        />
      </div>
      <div className="filter">
        <label htmlFor={`${ids}-sort`}>{t.browse.sort}</label>
        <select
          className="select"
          id={`${ids}-sort`}
          value={sortValue}
          onChange={(event) => update({ sort: event.target.value as BrowseSort })}
        >
          {sortOptions.map((sort) => (
            <option key={sort} value={sort}>
              {mode === "services" && sort === "rank"
                ? t.browse.sorts.popularity
                : t.browse.sorts[sort]}
            </option>
          ))}
        </select>
      </div>
      <div className="view-toggle" role="group" aria-label={t.browse.view}>
        <button
          type="button"
          className="button"
          aria-pressed={filters.view === "grid"}
          aria-label={t.browse.grid}
          title={t.browse.grid}
          onClick={() => update({ view: "grid" })}
        >
          <LayoutGrid aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={filters.view === "list"}
          aria-label={t.browse.list}
          title={t.browse.list}
          onClick={() => update({ view: "list" })}
        >
          <List aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="button filters-toggle"
        aria-expanded={advancedOpen}
        aria-controls={`${ids}-advanced`}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {t.draw.filters(advancedCount)}
        <ChevronDown aria-hidden="true" />
      </button>
      {advancedOpen && (
        <AdvancedFilters
          id={`${ids}-advanced`}
          className="browse-filters-panel"
          resetClassName="browse-filters-reset"
          values={filters}
          hasSeen={hasSeen}
          onChange={update}
          onReset={onReset}
          resetDisabled={!filtersChanged}
        />
      )}
    </div>
  );
}
