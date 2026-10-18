import type { ProviderInfo } from "@/lib/types";

export const NO_SERVICE_ERROR = "Choisissez au moins un service pour continuer.";

/** Lowercases and strips accents so « Canal+ » matches « canal+ » and « Arté » matches « arte ». */
export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").trim();
}

export function filterProviders(providers: ProviderInfo[], query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return providers;
  return providers.filter((provider) => normalizeSearch(provider.name).includes(needle));
}

/** Returns the French error message, or `null` when the selection can be saved. */
export function validateServices(selected: ReadonlySet<string> | readonly string[]) {
  const count = selected instanceof Set ? selected.size : (selected as readonly string[]).length;
  return count > 0 ? null : NO_SERVICE_ERROR;
}

/** The first two names, then how many more: « Netflix, Prime Video… (+3) ». */
export function summarizeNames(names: readonly string[], empty: string) {
  if (names.length === 0) return empty;
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")}… (+${names.length - 2})`;
}
