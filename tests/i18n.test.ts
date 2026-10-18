import { describe, expect, it } from "vitest";
import {
  LOCALES,
  langParam,
  localeOf,
  localizedPath,
  routeOf,
  switchLocalePath,
} from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { fr } from "@/lib/i18n/dictionaries/fr";
import { decideRouting } from "@/lib/i18n/routing";

/** Every path of a dictionary, with functions and arrays counted as leaves of their own kind. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}:fn(${value.length})`];
  if (Array.isArray(value)) return [`${path}:array(${value.length})`];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => shape(child, `${path}.${key}`));
  }
  return [`${path}:${typeof value}`];
}

describe("dictionaries", () => {
  it("have the same keys, with the same kind of value, in every language", () => {
    expect(shape(en)).toEqual(shape(fr));
  });

  it("leave no string empty", () => {
    const empty = (value: unknown): boolean =>
      typeof value === "string"
        ? value.trim() === ""
        : typeof value === "object" && value !== null
          ? Object.values(value).some(empty)
          : false;
    for (const dictionary of [fr, en]) expect(empty(dictionary)).toBe(false);
  });

  it("translate the genres under the French name that is stored", () => {
    expect(Object.keys(en.genres)).toEqual(Object.keys(fr.genres));
    expect(en.genres["Comédie"]).toBe("Comedy");
  });
});

describe("localized paths", () => {
  it("keep French without a prefix and put the other languages under theirs", () => {
    expect(LOCALES).toEqual(["fr", "en"]);
    expect(localizedPath("fr", "home")).toBe("/");
    expect(localizedPath("fr", "draw")).toBe("/tirage");
    expect(localizedPath("fr", "settings")).toBe("/reglages");
    expect(localizedPath("fr", "about")).toBe("/a-propos");
    expect(localizedPath("en", "home")).toBe("/en");
    expect(localizedPath("en", "draw")).toBe("/en/draw");
    expect(localizedPath("en", "films")).toBe("/en/films");
    expect(localizedPath("en", "settings")).toBe("/en/settings");
    expect(localizedPath("en", "about")).toBe("/en/about");
  });

  it("find the page behind a public path, with or without a trailing slash", () => {
    expect(routeOf("fr", "/tirage")).toBe("draw");
    expect(routeOf("fr", "/tirage/")).toBe("draw");
    expect(routeOf("en", "/en/draw")).toBe("draw");
    expect(routeOf("en", "/en")).toBe("home");
    expect(routeOf("fr", "/")).toBe("home");
    expect(routeOf("en", "/en/tirage")).toBeNull();
    expect(routeOf("fr", "/nope")).toBeNull();
  });

  it("read the language from the first segment", () => {
    expect(localeOf("/en/draw")).toBe("en");
    expect(localeOf("/en")).toBe("en");
    expect(localeOf("/tirage")).toBe("fr");
    expect(localeOf("/")).toBe("fr");
    expect(localeOf("/english")).toBe("fr");
  });

  it("switch a page to the same page in the other language", () => {
    expect(switchLocalePath("fr", "en", "/reglages")).toBe("/en/settings");
    expect(switchLocalePath("en", "fr", "/en/settings")).toBe("/reglages");
    expect(switchLocalePath("fr", "en", "/")).toBe("/en");
    expect(switchLocalePath("en", "fr", "/en/unknown")).toBe("/");
  });

  it("add a language to an API call only when it is not the default", () => {
    expect(langParam("fr")).toBe("");
    expect(langParam("en")).toBe("lang=en");
  });
});

describe("decideRouting", () => {
  it("serves French pages from /fr without showing the prefix", () => {
    expect(decideRouting("/")).toEqual({ action: "rewrite", to: "/fr" });
    expect(decideRouting("/tirage")).toEqual({ action: "rewrite", to: "/fr/tirage" });
    expect(decideRouting("/tirage/")).toEqual({ action: "rewrite", to: "/fr/tirage" });
    expect(decideRouting("/reglages")).toEqual({ action: "rewrite", to: "/fr/reglages" });
    expect(decideRouting("/a-propos")).toEqual({ action: "rewrite", to: "/fr/a-propos" });
    expect(decideRouting("/films")).toEqual({ action: "rewrite", to: "/fr/films" });
  });

  it("maps a translated English segment onto the shared page", () => {
    expect(decideRouting("/en/draw")).toEqual({ action: "rewrite", to: "/en/tirage" });
    expect(decideRouting("/en/settings")).toEqual({ action: "rewrite", to: "/en/reglages" });
    expect(decideRouting("/en/about")).toEqual({ action: "rewrite", to: "/en/a-propos" });
  });

  it("leaves a page whose segment is the same in both languages alone", () => {
    expect(decideRouting("/en/films")).toBeNull();
    expect(decideRouting("/en")).toBeNull();
  });

  it("redirects a path in the wrong language to its canonical URL", () => {
    expect(decideRouting("/en/tirage")).toEqual({ action: "redirect", to: "/en/draw" });
    expect(decideRouting("/en/reglages")).toEqual({ action: "redirect", to: "/en/settings" });
    expect(decideRouting("/fr")).toEqual({ action: "redirect", to: "/" });
    expect(decideRouting("/fr/tirage")).toEqual({ action: "redirect", to: "/tirage" });
  });

  it("ignores unknown paths and deeper paths so they end in a 404", () => {
    expect(decideRouting("/draw")).toBeNull();
    expect(decideRouting("/tirage/extra")).toBeNull();
    expect(decideRouting("/en/draw/extra")).toBeNull();
    expect(decideRouting("/nope")).toBeNull();
  });
});
