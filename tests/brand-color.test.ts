import { describe, expect, it } from "vitest";
import { colorFromCorners, inkFor } from "@/lib/brand-color";
import { fetchProviderLogo } from "@/lib/tmdb";

describe("colorFromCorners", () => {
  it("takes the color the four corners agree on", () => {
    const corner: [number, number, number, number] = [250, 80, 20, 255];
    expect(colorFromCorners([corner, corner, corner, [252, 78, 22, 255]])).toEqual({
      background: "#fa5014",
      ink: "#ffffff",
    });
  });

  it("gives up on a transparent or mixed corner", () => {
    expect(colorFromCorners([[0, 0, 0, 0]])).toBeNull();
    expect(
      colorFromCorners([
        [0, 0, 0, 255],
        [255, 255, 255, 255],
      ]),
    ).toBeNull();
    expect(colorFromCorners([])).toBeNull();
  });
});

describe("inkFor", () => {
  it("picks the readable ink", () => {
    expect(inkFor([255, 255, 255])).toBe("#0b0b0d");
    expect(inkFor([17, 60, 207])).toBe("#ffffff");
  });
});

describe("fetchProviderLogo", () => {
  it("refuses anything but a bare logo file name", async () => {
    for (const file of ["", "../secret.png", "a/b.png", "x.png", "logo.svg"]) {
      expect(await fetchProviderLogo(file)).toBeNull();
    }
  });
});
