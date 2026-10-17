import { describe, expect, it } from "vitest";
import { homeRedirectTarget } from "@/lib/home";

describe("homeRedirectTarget", () => {
  it("keeps the presentation for a visitor without saved services", () => {
    expect(homeRedirectTarget([], "")).toBeNull();
  });

  it("sends a visitor with a saved service to the draw", () => {
    expect(homeRedirectTarget(["8"], "")).toBe("/tirage");
  });

  it("keeps the presentation when ?intro is present, with or without a value", () => {
    expect(homeRedirectTarget(["8"], "?intro")).toBeNull();
    expect(homeRedirectTarget(["8"], "?intro=1")).toBeNull();
    expect(homeRedirectTarget(["8"], "?a=1&intro")).toBeNull();
  });

  it("ignores unrelated query parameters", () => {
    expect(homeRedirectTarget(["8"], "?utm_source=x")).toBe("/tirage");
    expect(homeRedirectTarget(["8"], "?introduction")).toBe("/tirage");
  });
});
