"use client";

import { Check, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { lastSelectedId, moveActive, toggleId, type ListKey } from "@/lib/multiselect";
import { filterProviders } from "@/lib/services";
import type { ProviderInfo } from "@/lib/types";

type Props = {
  label: string;
  options: ProviderInfo[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  emptyMessage: (query: string) => string;
  removeLabel: (name: string) => string;
};

function Logo({ option }: { option: ProviderInfo }) {
  return option.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized logos.
    <img src={option.logo} alt="" width={32} height={32} loading="lazy" />
  ) : (
    <span className="multiselect-logo-empty" aria-hidden="true" />
  );
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyMessage,
  removeLabel,
}: Props) {
  const ids = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const visible = useMemo(() => filterProviders(options, query), [options, query]);
  const chosen = useMemo(
    () => options.filter((option) => selected.has(option.id)),
    [options, selected],
  );
  const optionId = (id: string) => `${ids}-option-${id}`;
  const activeOption = open && active >= 0 ? visible[active] : undefined;

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

  function search(value: string) {
    setQuery(value);
    setOpen(true);
    setActive(value.trim() ? 0 : -1);
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
        options.map((option) => option.id),
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
      {chosen.length > 0 && (
        <ul className="multiselect-chips">
          {chosen.map((option) => (
            <li key={option.id} className="multiselect-chip">
              <Logo option={option} />
              <span className="multiselect-name">{option.name}</span>
              <button
                type="button"
                className="multiselect-remove"
                aria-label={removeLabel(option.name)}
                onClick={() => {
                  toggle(option.id);
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
        onChange={(event) => search(event.target.value)}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
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
          {visible.map((option, index) => {
            const isSelected = selected.has(option.id);
            return (
              <li
                key={option.id}
                id={optionId(option.id)}
                role="option"
                aria-selected={isSelected}
                className="multiselect-option"
                data-active={index === active || undefined}
                onClick={() => toggle(option.id)}
                onMouseMove={() => active !== index && setActive(index)}
              >
                <Logo option={option} />
                <span className="multiselect-name">{option.name}</span>
                <Check className="multiselect-tick" aria-hidden="true" />
              </li>
            );
          })}
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
