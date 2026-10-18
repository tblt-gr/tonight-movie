import type { ProviderInfo } from "@/lib/types";

/** Lowercases and strips accents so « Canal+ » matches « canal+ » and « Arté » matches « arte ». */
export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").trim();
}

export function filterProviders(providers: ProviderInfo[], query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return providers;
  return providers.filter((provider) => normalizeSearch(provider.name).includes(needle));
}

/** Returns `"none"` when no service is selected, or `null` when the selection can be saved. */
export function validateServices(selected: ReadonlySet<string> | readonly string[]): "none" | null {
  const count = selected instanceof Set ? selected.size : (selected as readonly string[]).length;
  return count > 0 ? null : "none";
}

/** The first two names, then how many more: « Netflix, Prime Video… (+3) ». */
export function summarizeNames(names: readonly string[], empty: string) {
  if (names.length === 0) return empty;
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")}… (+${names.length - 2})`;
}
