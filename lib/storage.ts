import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Film, Profile, Snapshot } from "./types";

const root = process.env.DATA_DIR || path.join(process.cwd(), ".cache");
const listsDirectory = path.join(root, "lists");
const profilesDirectory = path.join(root, "profiles");
const ttl = 24 * 60 * 60 * 1000;

function fileForList(url: string): string {
  return path.join(listsDirectory, `${createHash("sha256").update(url).digest("hex")}.json`);
}

function fileForProfile(username: string): string {
  return path.join(profilesDirectory, `${username.toLowerCase()}.json`);
}

async function readFresh<T extends { updatedAt: string }>(file: string): Promise<T | null> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as T;
    return Date.now() - Date.parse(value.updatedAt) < ttl ? value : null;
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), "utf8");
  await rename(temporary, file);
}

export const readListCache = (url: string) => readFresh<Snapshot>(fileForList(url));
export const writeListCache = (snapshot: Snapshot) =>
  writeAtomic(fileForList(snapshot.source), snapshot);
export const readProfileCache = (username: string) => readFresh<Profile>(fileForProfile(username));
export const writeProfileCache = (profile: Profile) =>
  writeAtomic(fileForProfile(profile.username), profile);

export async function knownFilms(): Promise<Map<string, Film>> {
  const known = new Map<string, Film>();
  const files = [path.join(process.cwd(), "dist", "films.json")];
  try {
    files.push(
      ...(await readdir(listsDirectory))
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(listsDirectory, name)),
    );
  } catch {
    /* no cache yet */
  }
  for (const file of files) {
    const snapshot = await readFresh<Snapshot>(file);
    if (snapshot?.films) for (const film of snapshot.films) known.set(film.letterboxdUrl, film);
  }
  return known;
}
