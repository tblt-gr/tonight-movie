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
