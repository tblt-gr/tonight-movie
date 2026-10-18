import { useI18n } from "@/components/I18nProvider";
import { RangeField } from "@/components/RangeField";
import {
  DURATION_SCALE,
  RATING_SCALE,
  hoursLabel,
  keepOrder,
  limitAt,
  positionOf,
  yearScale,
} from "@/lib/draw-state";
import { GENRES } from "@/lib/genres";
import type { Settings } from "@/lib/storage/schema";

type Props = {
  id: string;
  settings: Settings;
  /** Films were imported as seen, so hiding them can change the draw. */
  hasSeen: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
};

/** The fine draw filters, in a panel the visitor opens from the settings bar. */
export function DrawFilters({ id, settings, hasSeen, onChange, onReset }: Props) {
  const { t } = useI18n();
  const duration = DURATION_SCALE;
  const years = yearScale();

  function moveDuration(side: "minDuration" | "maxDuration", value: number) {
    const limit = limitAt(value, side === "minDuration" ? duration.min : duration.max);
    const pair = { minDuration: settings.minDuration, maxDuration: settings.maxDuration };
    onChange(
      keepOrder(
        { ...pair, [side]: limit },
        side,
        side === "minDuration" ? "maxDuration" : "minDuration",
        side === "minDuration",
      ),
    );
  }

  function moveYear(side: "minYear" | "maxYear", value: number) {
    const limit = limitAt(value, side === "minYear" ? years.min : years.max);
    const pair = { minYear: settings.minYear, maxYear: settings.maxYear };
    onChange(
      keepOrder(
        { ...pair, [side]: limit },
        side,
        side === "minYear" ? "maxYear" : "minYear",
        side === "minYear",
      ),
    );
  }

  function toggleGenre(name: string, checked: boolean) {
    const others = settings.genres.filter((genre) => genre !== name);
    onChange({ genres: checked ? [...others, name] : others });
  }

  return (
    <div className="draw-filters" id={id} role="group" aria-label={t.filters.advanced}>
      <RangeField
        label={t.filters.minDuration}
        display={
          settings.minDuration === null
            ? t.filters.minDurationNone
            : hoursLabel(settings.minDuration, t)
        }
        value={positionOf(settings.minDuration, duration.min, duration.min, duration.max)}
        {...duration}
        onChange={(value) => moveDuration("minDuration", value)}
      />
      <RangeField
        label={t.filters.maxDuration}
        display={
          settings.maxDuration === null
            ? t.filters.maxDurationNone
            : hoursLabel(settings.maxDuration, t)
        }
        value={positionOf(settings.maxDuration, duration.max, duration.min, duration.max)}
        {...duration}
        onChange={(value) => moveDuration("maxDuration", value)}
      />
      <RangeField
        label={t.filters.minRating}
        display={
          settings.minRating === null
            ? t.filters.minRatingNone
            : `${settings.minRating.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`
        }
        value={positionOf(settings.minRating, RATING_SCALE.min, RATING_SCALE.min, RATING_SCALE.max)}
        {...RATING_SCALE}
        onChange={(value) => onChange({ minRating: limitAt(value, RATING_SCALE.min) })}
      />
      <RangeField
        label={t.filters.minYear}
        display={settings.minYear === null ? t.filters.minYearNone : String(settings.minYear)}
        value={positionOf(settings.minYear, years.min, years.min, years.max)}
        {...years}
        onChange={(value) => moveYear("minYear", value)}
      />
      <RangeField
        label={t.filters.maxYear}
        display={settings.maxYear === null ? t.filters.maxYearNone : String(settings.maxYear)}
        value={positionOf(settings.maxYear, years.max, years.min, years.max)}
        {...years}
        onChange={(value) => moveYear("maxYear", value)}
      />
      {hasSeen && (
        <div className="check">
          <input
            id={`${id}-seen`}
            type="checkbox"
            checked={settings.excludeSeen}
            onChange={(event) => onChange({ excludeSeen: event.target.checked })}
          />
          <label htmlFor={`${id}-seen`}>{t.common.hideSeen}</label>
        </div>
      )}
      <fieldset className="genre-field">
        <legend>{t.filters.genres}</legend>
        <div className="genre-chips">
          {GENRES.map((genre) => (
            <label key={genre.id} className="genre-chip">
              <input
                type="checkbox"
                checked={settings.genres.includes(genre.name)}
                onChange={(event) => toggleGenre(genre.name, event.target.checked)}
              />
              <span>{t.genres[genre.name] ?? genre.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="button draw-filters-reset" onClick={onReset}>
        {t.filters.reset}
      </button>
    </div>
  );
}
