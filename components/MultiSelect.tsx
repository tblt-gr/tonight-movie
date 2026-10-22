"use client";

import { Check, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  arrangeOptions,
  lastSelectedId,
  moveActive,
  toggleId,
  type ListKey,
} from "@/lib/multiselect";
import { brandFor } from "@/lib/brand-color";
import type { Brand } from "@/lib/provider-colors";
import { filterProviders } from "@/lib/services";
import type { ProviderInfo } from "@/lib/types";

type Props = {
  label: string;
  options: ProviderInfo[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  emptyMessage: (query: string) => string;
  removeLabel: (name: string) => string;
  clearLabel: string;
  sectionLabels: { mine: string; others: string };
  /** The visitor's own services; defaults to the selection, so ticking a service moves it up. */
  owned?: ReadonlySet<string>;
  /** An option that always leads the list, such as « any service ». */
  pinnedId?: string;
  /** Written inside the field in place of the chips, for a bar with little room. */
  summary?: string;
};

function Logo({ option }: { option: ProviderInfo }) {
  return option.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized logos.
    <img src={option.logo} alt="" width={32} height={32} loading="lazy" />
  ) : (
    <span className="multiselect-logo-empty" aria-hidden="true" />
  );
}

function Chip({
  option,
  removeLabel,
  onRemove,
}: {
  option: ProviderInfo;
  removeLabel: string;
  onRemove: () => void;
}) {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    let alive = true;
    void brandFor(option.id, option.logo).then((found) => alive && setBrand(found));
    return () => {
      alive = false;
    };
  }, [option.id, option.logo]);
  return (
    <li
      className="multiselect-chip"
      style={
        brand
          ? ({ "--chip": brand.background, "--chip-ink": brand.ink } as React.CSSProperties)
          : undefined
      }
    >
      <Logo option={option} />
      <span className="multiselect-name">{option.name}</span>
      <button
        type="button"
        className="multiselect-remove"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyMessage,
  removeLabel,
  clearLabel,
  sectionLabels,
  owned,
  pinnedId,
  summary,
}: Props) {
  const ids = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const arrange = useCallback(
    (list: ProviderInfo[]) => arrangeOptions(list, selected, owned ?? selected, pinnedId),
    [selected, owned, pinnedId],
  );
  const sections = useMemo(
    () => arrange(filterProviders(options, query)),
    [arrange, options, query],
  );
  const visible = useMemo(() => [...sections.mine, ...sections.others], [sections]);
  const chosen = useMemo(() => {
    const all = arrange(options);
    return [...all.mine, ...all.others].filter((o) => selected.has(o.id));
  }, [arrange, options, selected]);
  const optionId = (id: string) => `${ids}-option-${id}`;
  const active = visible.findIndex((option) => option.id === activeId);
  const activeOption = open && active >= 0 ? visible[active] : undefined;
  const setActive = (index: number) => setActiveId(visible[index]?.id ?? null);

  useEffect(() => {
    if (!activeOption) return;
    document.getElementById(optionId(activeOption.id))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on the stable `ids`.
  }, [activeOption]);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function toggle(id: string) {
    onChange(toggleId(selected, id));
  }

  function clear() {
    onChange(new Set());
    inputRef.current?.focus();
  }

  function search(value: string) {
    setQuery(value);
    setOpen(true);
    const first = arrange(filterProviders(options, value));
    setActiveId(value.trim() ? ([...first.mine, ...first.others][0]?.id ?? null) : null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const { key } = event;
    const jump = key === "Home" || key === "End";
    if (key === "ArrowDown" || key === "ArrowUp" || (jump && open)) {
      event.preventDefault();
      setOpen(true);
      setActive(moveActive(active, visible.length, key as ListKey));
    } else if (key === "Enter" || (key === " " && !query)) {
      if (!activeOption) return;
      event.preventDefault();
      toggle(activeOption.id);
    } else if (key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        search("");
        setOpen(false);
      }
    } else if (key === "Backspace" && !query) {
      const id = lastSelectedId(
        chosen.map((option) => option.id),
        selected,
      );
      if (id) toggle(id);
    }
  }

  return (
    <div className="multiselect" ref={rootRef}>
      <label htmlFor={`${ids}-input`} className="multiselect-label">
        {label}
      </label>
      {summary === undefined && chosen.length > 0 && (
        <ul className="multiselect-chips">
          {chosen.map((option) => (
            <Chip
              key={option.id}
              option={option}
              removeLabel={removeLabel(option.name)}
              onRemove={() => {
                toggle(option.id);
                inputRef.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
      <div className="multiselect-field">
        <input
          ref={inputRef}
          id={`${ids}-input`}
          className="multiselect-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${ids}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? optionId(activeOption.id) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          placeholder={summary}
          title={summary}
          onChange={(event) => search(event.target.value)}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {selected.size > 0 && (
          <button
            type="button"
            className="multiselect-clear"
            aria-label={clearLabel}
            onClick={clear}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="multiselect-popup" hidden={!open}>
        <ul
          id={`${ids}-listbox`}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="multiselect-list"
          // Keeps focus in the input so a click does not close the list or move the caret.
          onMouseDown={(event) => event.preventDefault()}
        >
          {(["mine", "others"] as const).map((key) =>
            sections[key].length === 0 ? null : (
              <li key={key} role="presentation" className="multiselect-section">
                <span id={`${ids}-${key}`} className="multiselect-section-title">
                  {sectionLabels[key]}
                </span>
                <ul role="group" aria-labelledby={`${ids}-${key}`} className="multiselect-group">
                  {sections[key].map((option) => {
                    const isSelected = selected.has(option.id);
                    return (
                      <li
                        key={option.id}
                        id={optionId(option.id)}
                        role="option"
                        aria-selected={isSelected}
                        className="multiselect-option"
                        data-active={option.id === activeId || undefined}
                        onClick={() => toggle(option.id)}
                        onMouseMove={() => activeId !== option.id && setActiveId(option.id)}
                      >
                        <Logo option={option} />
                        <span className="multiselect-name">{option.name}</span>
                        <Check className="multiselect-tick" aria-hidden="true" />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ),
          )}
        </ul>
        {open && visible.length === 0 && (
          <p role="status" className="multiselect-empty">
            {emptyMessage(query.trim())}
          </p>
        )}
      </div>
    </div>
  );
}
