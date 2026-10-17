import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import {
  DEFAULT_LIMITS,
  ImportError,
  type ImportedFilm,
  parseLetterboxdExport,
  type ImportLimits,
} from "@/lib/import/letterboxd";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "fixtures", "letterboxd", name)));

function exportZip(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "watchlist.csv": fixture("watchlist.csv"),
    "watched.csv": fixture("watched.csv"),
    "likes/films.csv": fixture("liked.csv"),
    "lists/rainy-sundays.csv": fixture("list-with-preamble.csv"),
    "ratings.csv": fixture("ratings.csv"),
    "reviews.csv": strToU8("not,a,film file\n"),
    ...extra,
  });
}

const rejection = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ImportError);
  return error as ImportError;
};

const find = (films: ImportedFilm[], title: string) => films.find((f) => f.title === title);

describe("parseCsv", () => {
  const parse = (text: string) =>
    parseCsv(text, 100, () => {
      throw new Error("limit");
    });

  it("handles quoted commas, escaped quotes, newlines, CRLF and a BOM", () => {
    expect(parse('﻿a,"b, ""c""",d\r\n"x\ny",,z\r\n')).toEqual([
      ["a", 'b, "c"', "d"],
      ["x\ny", "", "z"],
    ]);
  });

  it("skips blank lines and keeps a final row without newline", () => {
    expect(parse("a,b\n\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("stops beyond the row limit", () => {
    expect(() =>
      parseCsv("a\nb\nc\n", 2, () => {
        throw new Error("limit");
      }),
    ).toThrow("limit");
  });
});

describe("parseLetterboxdExport", () => {
  it("reads the watchlist, lists, liked and seen films from a full export", async () => {
    const { films, lists } = await parseLetterboxdExport(exportZip(), "export.zip");
    expect(lists).toEqual(["Rainy Sundays"]);
    expect(find(films, "Fake Film One")).toEqual({
      key: "https://boxd.it/aaaa1",
      title: "Fake Film One",
      year: 2001,
      uri: "https://boxd.it/aaaa1",
      memberships: ["watchlist", "seen", "list:Rainy Sundays"],
    });
    expect(find(films, "Liked Film")?.memberships).toEqual(["liked"]);
    expect(find(films, "Seen Only")?.memberships).toEqual(["seen"]);
    expect(find(films, "Rain Movie")?.memberships).toEqual(["list:Rainy Sundays"]);
  });

  it("accepts a lone watchlist.csv", async () => {
    const { films, lists } = await parseLetterboxdExport(fixture("watchlist.csv"), "watchlist.csv");
    expect(lists).toEqual([]);
    expect(films.map((f) => f.title)).toEqual([
      "Fake Film One",
      "Fake, Film: Two",
      "Café Imaginaire",
    ]);
    expect(films.every((f) => f.memberships.join() === "watchlist")).toBe(true);
  });

  it("handles quoted commas, accents, empty years and duplicate rows", async () => {
    const { films } = await parseLetterboxdExport(fixture("watchlist.csv"), "watchlist.csv");
    expect(find(films, "Fake, Film: Two")?.year).toBe(1999);
    expect(find(films, "Café Imaginaire")).toMatchObject({ year: null });
    expect(films).toHaveLength(3);
  });

  it("reads a lone list with a metadata preamble", async () => {
    const { films, lists } = await parseLetterboxdExport(
      fixture("list-with-preamble.csv"),
      "rainy-sundays.csv",
    );
    expect(lists).toEqual(["Rainy Sundays"]);
    expect(films.map((f) => f.title)).toEqual(["Fake Film One", "Rain Movie"]);
  });

  it("maps lone watched and liked files", async () => {
    const seen = await parseLetterboxdExport(fixture("watched.csv"), "watched.csv");
    expect(seen.films[0].memberships).toEqual(["seen"]);
    const liked = await parseLetterboxdExport(fixture("liked.csv"), "films.csv");
    expect(liked.films[0].memberships).toEqual(["liked"]);
  });

  it("falls back to title|year when the URI is missing or not a Letterboxd link", async () => {
    const csv = strToU8(
      "Date,Name,Year,Letterboxd URI\n2024-01-01,No Uri,2000,\n2024-01-01,Bad Uri,2001,javascript:alert(1)\n",
    );
    const { films } = await parseLetterboxdExport(csv, "watchlist.csv");
    expect(films.map((f) => [f.key, f.uri])).toEqual([
      ["No Uri|2000", null],
      ["Bad Uri|2001", null],
    ]);
  });

  it("skips malformed rows", async () => {
    const csv = strToU8(
      "Date,Name,Year,Letterboxd URI\n2024-01-01\n,,,\n2024-01-01,Good,20x0,https://boxd.it/g\n",
    );
    const { films } = await parseLetterboxdExport(csv, "watchlist.csv");
    expect(films).toEqual([
      {
        key: "https://boxd.it/g",
        title: "Good",
        year: null,
        uri: "https://boxd.it/g",
        memberships: ["watchlist"],
      },
    ]);
  });

  it("never reads ratings, reviews, diary or comments", async () => {
    const only = zipSync({
      "ratings.csv": fixture("ratings.csv"),
      "diary.csv": fixture("ratings.csv"),
      "reviews.csv": fixture("ratings.csv"),
      "comments.csv": fixture("ratings.csv"),
    });
    expect((await rejection(parseLetterboxdExport(only, "export.zip"))).code).toBe("unrecognized");
    const lone = await rejection(parseLetterboxdExport(fixture("ratings.csv"), "ratings.csv"));
    expect(lone.code).toBe("unrecognized");
    const { films } = await parseLetterboxdExport(
      exportZip({ "deleted/watchlist.csv": strToU8("Name,Year\nGhost,2000\n") }),
      "export.zip",
    );
    expect(find(films, "Ghost")).toBeUndefined();
    expect(JSON.stringify(films)).not.toContain("4.5");
  });

  it("accepts an export nested in a top folder", async () => {
    const zip = zipSync({ "letterboxd-export/watchlist.csv": fixture("watchlist.csv") });
    const { films } = await parseLetterboxdExport(zip, "export.zip");
    expect(films).toHaveLength(3);
  });

  it("rejects unrecognized files with a French message", async () => {
    for (const [bytes, name] of [
      [strToU8("hello world"), "notes.txt"],
      [strToU8("a,b\n1,2\n"), "other.csv"],
      [new Uint8Array([0xff, 0xfe, 0x00, 0x80]), "binary.csv"],
    ] as const) {
      const error = await rejection(parseLetterboxdExport(bytes, name));
      expect(error.code).toBe("unrecognized");
      expect(error.message).toContain("Letterboxd");
    }
  });

  it("rejects an empty file with its own message", async () => {
    const error = await rejection(parseLetterboxdExport(new Uint8Array(), "empty.csv"));
    expect(error.code).toBe("empty");
    expect(error.message).toBe("Ce fichier est vide.");
  });

  it("rejects an empty file with its own message", async () => {
    const error = await rejection(parseLetterboxdExport(new Uint8Array(), "empty.csv"));
    expect(error.code).toBe("empty");
    expect(error.message).toBe("Ce fichier est vide.");
  });

  it("rejects a corrupt archive", async () => {
    const zip = exportZip();
    const error = await rejection(parseLetterboxdExport(zip.subarray(0, 20), "export.zip"));
    expect(["corrupt", "unrecognized"]).toContain(error.code);
  });

  describe("limits", () => {
    const tight = (overrides: Partial<ImportLimits>): ImportLimits => ({
      ...DEFAULT_LIMITS,
      ...overrides,
    });

    it("rejects an oversized file", async () => {
      const error = await rejection(
        parseLetterboxdExport(exportZip(), "export.zip", tight({ maxFileBytes: 100 })),
      );
      expect(error.code).toBe("too_large");
    });

    it("rejects a bomb before it is fully inflated", async () => {
      const filler = "Date,Name,Year,Letterboxd URI\n".padEnd(8 * 1024 * 1024, "x");
      const bomb = zipSync({ "watchlist.csv": strToU8(filler) });
      expect(bomb.length).toBeLessThan(100 * 1024);
      const error = await rejection(
        parseLetterboxdExport(bomb, "export.zip", tight({ maxUncompressedBytes: 1024 * 1024 })),
      );
      expect(error.code).toBe("too_large");
    });

    it("rejects a high compression ratio", async () => {
      const bomb = zipSync({ "watchlist.csv": strToU8("a".repeat(2 * 1024 * 1024)) });
      const error = await rejection(parseLetterboxdExport(bomb, "export.zip"));
      expect(error.code).toBe("too_large");
    });

    it("rejects too many entries", async () => {
      const error = await rejection(
        parseLetterboxdExport(exportZip(), "export.zip", tight({ maxEntries: 2 })),
      );
      expect(error.code).toBe("too_large");
    });

    it("rejects too many rows", async () => {
      const rows = Array.from({ length: 30 }, (_, i) => `2024-01-01,Film ${i},2000,`).join("\n");
      const csv = strToU8(`Date,Name,Year,Letterboxd URI\n${rows}\n`);
      const error = await rejection(
        parseLetterboxdExport(csv, "watchlist.csv", tight({ maxRows: 10 })),
      );
      expect(error.code).toBe("too_many_rows");
    });
  });

  it("parses 5,000 rows quickly", async () => {
    const rows = Array.from(
      { length: 5000 },
      (_, i) => `2024-01-01,"Film, ${i}",${1950 + (i % 70)},https://boxd.it/f${i}`,
    ).join("\n");
    const csv = strToU8(`Date,Name,Year,Letterboxd URI\n${rows}\n`);
    const start = performance.now();
    const { films } = await parseLetterboxdExport(csv, "watchlist.csv");
    expect(films).toHaveLength(5000);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
