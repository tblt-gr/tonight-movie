import { describe, expect, it } from "vitest";
import { homeRedirectTarget } from "@/lib/home";

describe("homeRedirectTarget", () => {
  it("keeps the presentation for a visitor without saved services", () => {
    expect(homeRedirectTarget([], "", "fr")).toBeNull();
  });

  it("sends a visitor with a saved service to the draw, in their language", () => {
    expect(homeRedirectTarget(["8"], "", "fr")).toBe("/tirage");
    expect(homeRedirectTarget(["8"], "", "en")).toBe("/en/draw");
  });

  it("keeps the presentation when ?intro is present, with or without a value", () => {
    expect(homeRedirectTarget(["8"], "?intro", "fr")).toBeNull();
    expect(homeRedirectTarget(["8"], "?intro=1", "fr")).toBeNull();
    expect(homeRedirectTarget(["8"], "?a=1&intro", "en")).toBeNull();
  });

  it("ignores unrelated query parameters", () => {
    expect(homeRedirectTarget(["8"], "?utm_source=x", "fr")).toBe("/tirage");
    expect(homeRedirectTarget(["8"], "?introduction", "fr")).toBe("/tirage");
  });
});
