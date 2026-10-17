import { describe, expect, it } from "vitest";
import { canonicalListUrl } from "../lib/source";

describe("Letterboxd URL validation", () => {
  it("accepts public list and watchlist paths", () => {
    expect(
      canonicalListUrl("https://letterboxd.com/example/list/my-films/page/2/?sort=popular"),
    ).toBe("https://letterboxd.com/example/list/my-films/");
    expect(canonicalListUrl("https://www.letterboxd.com/example/watchlist/")).toBe(
      "https://letterboxd.com/example/watchlist/",
    );
  });

  it("rejects other hosts and credentialed URLs", () => {
    expect(() =>
      canonicalListUrl("https://letterboxd.com.evil.example/example/list/films/"),
    ).toThrow();
    expect(() => canonicalListUrl("https://user:pass@letterboxd.com/example/watchlist/")).toThrow();
    expect(() => canonicalListUrl("http://letterboxd.com/example/watchlist/")).toThrow();
  });
});
