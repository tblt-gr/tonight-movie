import { describe, expect, it } from "vitest";
import { lastSelectedId, moveActive, toggleId } from "@/lib/multiselect";

describe("toggleId", () => {
  it("adds an id that is not selected", () => {
    expect([...toggleId(new Set(["8"]), "119")]).toEqual(["8", "119"]);
  });

  it("removes an id that is selected", () => {
    expect([...toggleId(new Set(["8", "119"]), "8")]).toEqual(["119"]);
  });

  it("does not mutate the incoming set", () => {
    const current = new Set(["8"]);
    toggleId(current, "119");
    expect([...current]).toEqual(["8"]);
  });
});

describe("lastSelectedId", () => {
  const ids = ["8", "119", "381", "234"];

  it("follows display order, not selection order", () => {
    expect(lastSelectedId(ids, new Set(["381", "8"]))).toBe("381");
  });

  it("ignores selected ids that are not options", () => {
    expect(lastSelectedId(ids, new Set(["999"]))).toBeNull();
  });

  it("returns null for an empty selection", () => {
    expect(lastSelectedId(ids, new Set())).toBeNull();
  });
});

describe("moveActive", () => {
  it("starts at the first option going down and the last going up", () => {
    expect(moveActive(-1, 3, "ArrowDown")).toBe(0);
    expect(moveActive(-1, 3, "ArrowUp")).toBe(2);
  });

  it("wraps around at both ends", () => {
    expect(moveActive(2, 3, "ArrowDown")).toBe(0);
    expect(moveActive(0, 3, "ArrowUp")).toBe(2);
  });

  it("steps by one in the middle", () => {
    expect(moveActive(1, 3, "ArrowDown")).toBe(2);
    expect(moveActive(1, 3, "ArrowUp")).toBe(0);
  });

  it("jumps with Home and End", () => {
    expect(moveActive(1, 3, "Home")).toBe(0);
    expect(moveActive(1, 3, "End")).toBe(2);
  });

  it("returns -1 when there are no options", () => {
    expect(moveActive(0, 0, "ArrowDown")).toBe(-1);
  });
});
