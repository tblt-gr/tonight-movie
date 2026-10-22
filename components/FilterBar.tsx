"use client";

import { ChevronDown, LayoutGrid, List } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { MultiSelect } from "@/components/MultiSelect";
import { RangeField } from "@/components/RangeField";
import {
  DEFAULT_FILTERS,
  SERVICE_ANY,
  sortsFor,
  type BrowseFilters,
  type BrowseMode,
  type BrowseSort,
} from "@/lib/browse";
import { GENRES } from "@/lib/genres";
import {
  DURATION_SCALE,
  RATING_SCALE,
  durationLabel,
  durationOptions,
  hoursLabel,
  keepOrder,
  limitAt,
  positionOf,
  sourceOptions,
  yearScale,
} from "@/lib/draw-state";
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
  const years = yearScale();
  const sourceValue = sources.length === 1 ? sources[0] : "many";
  const advancedCount =
    (filters.maxDuration !== null ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.minDuration !== null ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0) +
    (filters.minYear !== null ? 1 : 0) +
    (filters.maxYear !== null ? 1 : 0) +
    (filters.genres.length > 0 ? 1 : 0);

  function moveDuration(side: "minDuration" | "maxDuration", value: number) {
    const limit = limitAt(value, side === "minDuration" ? DURATION_SCALE.min : DURATION_SCALE.max);
    update(
      keepOrder(
        { minDuration: filters.minDuration, maxDuration: filters.maxDuration, [side]: limit },
        side,
        side === "minDuration" ? "maxDuration" : "minDuration",
        side === "minDuration",
      ),
    );
  }

  function moveYear(side: "minYear" | "maxYear", value: number) {
    const limit = limitAt(value, side === "minYear" ? years.min : years.max);
    update(
      keepOrder(
        { minYear: filters.minYear, maxYear: filters.maxYear, [side]: limit },
        side,
        side === "minYear" ? "maxYear" : "minYear",
        side === "minYear",
      ),
    );
  }
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
        <div
          className="browse-filters-panel"
          id={`${ids}-advanced`}
          role="group"
          aria-label={t.filters.advanced}
        >
          <div className="filter">
            <label htmlFor={`${ids}-duration`}>{t.filters.maxDuration}</label>
            <select
              className="select"
              id={`${ids}-duration`}
              value={filters.maxDuration ?? ""}
              onChange={(event) =>
                update({ maxDuration: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">{t.filters.maxDurationNone}</option>
              {durationOptions(filters.maxDuration).map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes, t)}
                </option>
              ))}
            </select>
          </div>
          {hasSeen && (
            <div className="check">
              <input
                id={`${ids}-seen`}
                type="checkbox"
                checked={filters.hideSeen}
                onChange={(event) => update({ hideSeen: event.target.checked })}
              />
              <label htmlFor={`${ids}-seen`}>{t.common.hideSeen}</label>
            </div>
          )}
          <RangeField
            label={t.filters.minDuration}
            display={
              filters.minDuration === null
                ? t.filters.minDurationNone
                : hoursLabel(filters.minDuration, t)
            }
            value={positionOf(
              filters.minDuration,
              DURATION_SCALE.min,
              DURATION_SCALE.min,
              DURATION_SCALE.max,
            )}
            {...DURATION_SCALE}
            onChange={(value) => moveDuration("minDuration", value)}
          />
          <RangeField
            label={t.filters.minRating}
            display={
              filters.minRating === null
                ? t.filters.minRatingNone
                : `${filters.minRating.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`
            }
            value={positionOf(
              filters.minRating,
              RATING_SCALE.min,
              RATING_SCALE.min,
              RATING_SCALE.max,
            )}
            {...RATING_SCALE}
            onChange={(value) => update({ minRating: limitAt(value, RATING_SCALE.min) })}
          />
          <RangeField
            label={t.filters.minYear}
            display={filters.minYear === null ? t.filters.minYearNone : String(filters.minYear)}
            value={positionOf(filters.minYear, years.min, years.min, years.max)}
            {...years}
            onChange={(value) => moveYear("minYear", value)}
          />
          <RangeField
            label={t.filters.maxYear}
            display={filters.maxYear === null ? t.filters.maxYearNone : String(filters.maxYear)}
            value={positionOf(filters.maxYear, years.max, years.min, years.max)}
            {...years}
            onChange={(value) => moveYear("maxYear", value)}
          />
          <fieldset className="genre-field">
            <legend>{t.filters.genres}</legend>
            <div className="genre-chips">
              {GENRES.map((genre) => (
                <label key={genre.id} className="genre-chip">
                  <input
                    type="checkbox"
                    checked={filters.genres.includes(genre.name)}
                    onChange={(event) =>
                      update({
                        genres: event.target.checked
                          ? [...filters.genres, genre.name]
                          : filters.genres.filter((name) => name !== genre.name),
                      })
                    }
                  />
                  <span>{t.genres[genre.name] ?? genre.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="button browse-filters-reset"
            disabled={!filtersChanged}
            onClick={onReset}
          >
            {t.filters.reset}
          </button>
        </div>
      )}
    </div>
  );
}
