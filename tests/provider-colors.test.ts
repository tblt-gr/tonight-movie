import { describe, expect, it } from "vitest";
import { brandOf } from "@/lib/provider-colors";

describe("brandOf", () => {
  it("knows the main providers", () => {
    expect(brandOf("8")).toEqual({ background: "#E50914", ink: "#ffffff" });
    expect(brandOf("1796")).toEqual(brandOf("8"));
  });

  it("returns null for an unknown provider so the accent color applies", () => {
    expect(brandOf("999999")).toBeNull();
  });
});
