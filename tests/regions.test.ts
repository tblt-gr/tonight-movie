import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGION,
  detectRegion,
  effectiveRegion,
  regionOptions,
  regionParam,
} from "@/lib/regions";
import { parseContext, parseDiscover, parseRegionOnly } from "@/lib/validation";

describe("detectRegion", () => {
  it("reads the country of the first language that names one", () => {
    expect(detectRegion(["fr-BE", "en-US"])).toBe("BE");
    expect(detectRegion(["en", "de-CH"])).toBe("CH");
  });

  it("falls back to France for a language without a covered country", () => {
    expect(detectRegion(["fr"])).toBe(DEFAULT_REGION);
    expect(detectRegion(["en-ZZ"])).toBe(DEFAULT_REGION);
    expect(detectRegion([])).toBe(DEFAULT_REGION);
  });
});

describe("effectiveRegion", () => {
  it("prefers the visitor's choice over the browser", () => {
    expect(effectiveRegion("CA", ["fr-BE"])).toBe("CA");
    expect(effectiveRegion(null, ["fr-BE"])).toBe("BE");
  });
});

describe("regionParam", () => {
  it("adds nothing for France", () => {
    expect(regionParam("FR")).toBe("");
    expect(regionParam("BE")).toBe("region=BE");
  });
});

describe("regionOptions", () => {
  it("names the countries in the page language, sorted", () => {
    const fr = regionOptions("fr");
    expect(fr.find((o) => o.code === "BE")?.name).toBe("Belgique");
    expect(fr.map((o) => o.name)).toEqual(
      [...fr.map((o) => o.name)].sort((a, b) => a.localeCompare(b, "fr")),
    );
    expect(regionOptions("en").find((o) => o.code === "BE")?.name).toBe("Belgium");
  });
});

describe("region parameter", () => {
  it("defaults to France and accepts a covered country", () => {
    expect(parseContext(new URLSearchParams()).region).toBe("FR");
    expect(parseContext(new URLSearchParams("region=BE")).region).toBe("BE");
    expect(parseRegionOnly(new URLSearchParams("region=CH"))).toBe("CH");
    expect(parseDiscover(new URLSearchParams("providers=8&region=BE")).region).toBe("BE");
  });

  it("rejects an unknown country before it reaches TMDB", () => {
    expect(() => parseContext(new URLSearchParams("region=ZZ"))).toThrow();
    expect(() => parseContext(new URLSearchParams("region=fr"))).toThrow();
    expect(() => parseRegionOnly(new URLSearchParams("region=FR&region=BE"))).toThrow();
  });
});
