import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NO_SERVICE_ERROR,
  filterProviders,
  normalizeSearch,
  selectedFirst,
  validateServices,
} from "@/lib/services";
import { loadSettings, resetSettings, updateSettings } from "@/lib/storage/settings";
import type { ProviderInfo } from "@/lib/types";

const provider = (id: string, name: string): ProviderInfo => ({ id, name, logo: null });

const providers = [
  provider("8", "Netflix"),
  provider("119", "Amazon Prime Video"),
  provider("381", "Canal+"),
  provider("234", "Arte"),
  provider("1899", "Max Amazon Channel"),
];

describe("filterProviders", () => {
  it("ignores case", () => {
    expect(filterProviders(providers, "NETFLIX").map((p) => p.id)).toEqual(["8"]);
  });

  it("ignores accents on both sides", () => {
    const withAccent = [provider("1", "Orange Cinéma Séries"), provider("2", "Arte")];
    expect(filterProviders(withAccent, "cinema").map((p) => p.id)).toEqual(["1"]);
    expect(filterProviders(withAccent, "CINÉMA").map((p) => p.id)).toEqual(["1"]);
    expect(filterProviders(providers, "árte").map((p) => p.id)).toEqual(["234"]);
  });

  it("matches inside the name and keeps the order", () => {
    expect(filterProviders(providers, "amazon").map((p) => p.id)).toEqual(["119", "1899"]);
  });

  it("returns everything for a blank query and nothing for no match", () => {
    expect(filterProviders(providers, "  ")).toHaveLength(providers.length);
    expect(filterProviders(providers, "zzz")).toEqual([]);
  });
});

describe("normalizeSearch", () => {
  it("strips accents, case and surrounding spaces", () => {
    expect(normalizeSearch("  Été ")).toBe("ete");
  });
});

describe("selectedFirst", () => {
  it("puts selected providers on top and keeps the TMDB order inside each group", () => {
    const ordered = selectedFirst(providers, new Set(["234", "119"]));
    expect(ordered.map((p) => p.id)).toEqual(["119", "234", "8", "381", "1899"]);
  });

  it("leaves the order alone when nothing is selected", () => {
    expect(selectedFirst(providers, new Set())).toEqual(providers);
  });
});

describe("validateServices", () => {
  it("requires at least one service", () => {
    expect(validateServices(new Set())).toBe(NO_SERVICE_ERROR);
    expect(validateServices([])).toBe(NO_SERVICE_ERROR);
    expect(validateServices(new Set(["8"]))).toBeNull();
  });
});

describe("services persistence", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => void store.set(key, value),
          removeItem: (key: string) => void store.delete(key),
        },
      },
    });
    resetSettings();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("round-trips the selected services", () => {
    updateSettings({ services: ["8", "119"] });
    expect(loadSettings().services).toEqual(["8", "119"]);
  });

  it("keeps Prime Video and its channels as separate ids", () => {
    updateSettings({ services: ["119", "1899"] });
    expect(new Set(loadSettings().services).size).toBe(2);
  });
});
