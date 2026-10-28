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

export type AdvancedValues = {
  hideSeen: boolean;
  minDuration: number | null;
  maxDuration: number | null;
  minRating: number | null;
  minYear: number | null;
  maxYear: number | null;
  genres: string[];
};

type Props = {
  id: string;
  values: AdvancedValues;
  /** Films were imported as seen, so hiding them can change the results. */
  hasSeen: boolean;
  onChange: (patch: Partial<AdvancedValues>) => void;
  onReset: () => void;
  resetDisabled?: boolean;
  /** Layout of the panel, which the draw and the film browser place differently. */
  className: string;
  resetClassName: string;
};

/** The fine filters shared by the draw and the film browser, so both list them in the same order. */
export function AdvancedFilters({
  id,
  values,
  hasSeen,
  onChange,
  onReset,
  resetDisabled = false,
  className,
  resetClassName,
}: Props) {
  const { t } = useI18n();
  const duration = DURATION_SCALE;
  const years = yearScale();

  function moveDuration(side: "minDuration" | "maxDuration", value: number) {
    const limit = limitAt(value, side === "minDuration" ? duration.min : duration.max);
    const pair = { minDuration: values.minDuration, maxDuration: values.maxDuration };
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
    const pair = { minYear: values.minYear, maxYear: values.maxYear };
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
    const others = values.genres.filter((genre) => genre !== name);
    onChange({ genres: checked ? [...others, name] : others });
  }

  return (
    <div className={className} id={id} role="group" aria-label={t.filters.advanced}>
      <RangeField
        label={t.filters.minDuration}
        display={
          values.minDuration === null
            ? t.filters.minDurationNone
            : hoursLabel(values.minDuration, t)
        }
        value={positionOf(values.minDuration, duration.min, duration.min, duration.max)}
        {...duration}
        onChange={(value) => moveDuration("minDuration", value)}
      />
      <RangeField
        label={t.filters.maxDuration}
        display={
          values.maxDuration === null
            ? t.filters.maxDurationNone
            : hoursLabel(values.maxDuration, t)
        }
        value={positionOf(values.maxDuration, duration.max, duration.min, duration.max)}
        {...duration}
        onChange={(value) => moveDuration("maxDuration", value)}
      />
      <RangeField
        label={t.filters.minRating}
        display={
          values.minRating === null
            ? t.filters.minRatingNone
            : `${values.minRating.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`
        }
        value={positionOf(values.minRating, RATING_SCALE.min, RATING_SCALE.min, RATING_SCALE.max)}
        {...RATING_SCALE}
        onChange={(value) => onChange({ minRating: limitAt(value, RATING_SCALE.min) })}
      />
      <RangeField
        label={t.filters.minYear}
        display={values.minYear === null ? t.filters.minYearNone : String(values.minYear)}
        value={positionOf(values.minYear, years.min, years.min, years.max)}
        {...years}
        onChange={(value) => moveYear("minYear", value)}
      />
      <RangeField
        label={t.filters.maxYear}
        display={values.maxYear === null ? t.filters.maxYearNone : String(values.maxYear)}
        value={positionOf(values.maxYear, years.max, years.min, years.max)}
        {...years}
        onChange={(value) => moveYear("maxYear", value)}
      />
      {hasSeen && (
        <div className="check">
          <input
            id={`${id}-seen`}
            type="checkbox"
            checked={values.hideSeen}
            onChange={(event) => onChange({ hideSeen: event.target.checked })}
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
                checked={values.genres.includes(genre.name)}
                onChange={(event) => toggleGenre(genre.name, event.target.checked)}
              />
              <span>{t.genres[genre.name] ?? genre.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className={`button ${resetClassName}`}
        disabled={resetDisabled}
        onClick={onReset}
      >
        {t.filters.reset}
      </button>
    </div>
  );
}
