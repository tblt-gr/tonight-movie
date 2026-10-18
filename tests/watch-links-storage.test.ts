import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearWatchLinks, loadWatchLinks, saveWatchLinks } from "@/lib/storage/watch-links";

const DAY = 24 * 60 * 60 * 1000;

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

describe("watch links storage", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  it("remembers links, and an empty answer too", () => {
    saveWatchLinks(1, { "8": "https://www.netflix.com/title/1" }, 1000);
    saveWatchLinks(2, {}, 1000);
    expect(loadWatchLinks(1, 2000)).toEqual({ "8": "https://www.netflix.com/title/1" });
    expect(loadWatchLinks(2, 2000)).toEqual({});
    expect(loadWatchLinks(3, 2000)).toBeNull();
  });

  it("expires after a week", () => {
    saveWatchLinks(1, { "8": "https://www.netflix.com/title/1" }, 0);
    expect(loadWatchLinks(1, 6 * DAY)).not.toBeNull();
    expect(loadWatchLinks(1, 8 * DAY)).toBeNull();
  });

  it("ignores corrupt storage and non-https links", () => {
    storage.setItem("tonight-movie:watch-links", "{nope");
    expect(loadWatchLinks(1)).toBeNull();
    storage.setItem(
      "tonight-movie:watch-links",
      JSON.stringify({ "1": { at: Date.now(), links: { "8": "javascript:alert(1)" } } }),
    );
    expect(loadWatchLinks(1)).toEqual({});
  });

  it("keeps the 200 most recent films", () => {
    for (let id = 1; id <= 205; id++) saveWatchLinks(id, {}, id);
    expect(loadWatchLinks(1, 300)).toBeNull();
    expect(loadWatchLinks(205, 300)).toEqual({});
  });

  it("is erased by clearWatchLinks", () => {
    saveWatchLinks(1, {}, 1000);
    clearWatchLinks();
    expect(loadWatchLinks(1, 2000)).toBeNull();
  });
});
