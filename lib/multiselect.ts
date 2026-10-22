import type { ProviderInfo } from "@/lib/types";

/** Returns a new set with `id` added, or removed when it was already selected. */
export function toggleId(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Returns the id that Backspace removes: the last selected option in display order. */
export function lastSelectedId(optionIds: readonly string[], selected: ReadonlySet<string>) {
  for (let index = optionIds.length - 1; index >= 0; index -= 1) {
    if (selected.has(optionIds[index])) return optionIds[index];
  }
  return null;
}

export type ListKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Moves the active option index; arrows wrap around, `-1` means no active option. */
export function moveActive(current: number, count: number, key: ListKey) {
  if (count === 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 || current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}

export type OptionSections = { mine: ProviderInfo[]; others: ProviderInfo[] };

/**
 * Splits the options into the visitor's services and the others. Each section lists the
 * selected options first, then the rest, both alphabetically; `pinnedId` always leads.
 */
export function arrangeOptions(
  options: readonly ProviderInfo[],
  selected: ReadonlySet<string>,
  owned: ReadonlySet<string>,
  pinnedId?: string,
): OptionSections {
  const rank = (option: ProviderInfo) =>
    option.id === pinnedId ? 0 : selected.has(option.id) ? 1 : 2;
  const order = (a: ProviderInfo, b: ProviderInfo) =>
    rank(a) - rank(b) || a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  const isMine = (option: ProviderInfo) => option.id === pinnedId || owned.has(option.id);
  return {
    mine: options.filter(isMine).sort(order),
    others: options.filter((option) => !isMine(option)).sort(order),
  };
}
