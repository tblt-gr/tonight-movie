import { load } from "cheerio";
import { fetchText } from "./source";
import { readProfileCache, writeProfileCache } from "./storage";
import type { Profile, ProfileEntry } from "./types";

async function publicPage(url: string): Promise<string | null> {
  try {
    return await fetchText(url);
  } catch (error) {
    if (/HTTP (403|404)/.test(String(error))) return null;
    throw error;
  }
}

function parseLists(page: string, kind: "created" | "liked"): ProfileEntry[] {
  const $ = load(page);
  const result: ProfileEntry[] = [];
  $("article.list-summary").each((_, article) => {
    const name = $(article).find("h2.name a[href]").first();
    const href = name.attr("href") || "";
    if (!/^\/[A-Za-z0-9_-]+\/list\/[A-Za-z0-9_-]+\/$/.test(href)) return;
    const count = $(article)
      .find(".content-reactions-strip .value")
      .first()
      .text()
      .replace(/\D/g, "");
    result.push({
      url: `https://letterboxd.com${href}`,
      title: name.text().trim(),
      count: count ? Number(count) : null,
      kind,
    });
  });
  return result;
}

async function section(url: string, kind: "created" | "liked"): Promise<ProfileEntry[] | null> {
  const first = await publicPage(url);
  if (first === null) return null;
  const entries = parseLists(first, kind);
  const escaped = new URL(url).pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pages = [...first.matchAll(new RegExp(`${escaped}page/(\\d+)/`, "g"))].map((match) =>
    Number(match[1]),
  );
  const last = Math.max(1, ...pages);
  if (last > 100) throw new Error("Ce profil contient trop de pages pour cette version.");
  for (let page = 2; page <= last; page++) {
    const content = await publicPage(`${url}page/${page}/`);
    if (content === null) break;
    entries.push(...parseLists(content, kind));
  }
  return entries;
}

export async function readProfile(input: string): Promise<Profile> {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(input))
    throw new Error("Entrez un nom d'utilisateur Letterboxd valide.");
  const username = input.toLowerCase();
  const cached = await readProfileCache(username);
  if (cached) return cached;
  const root = `https://letterboxd.com/${username}/`;
  const created = await section(`${root}lists/`, "created");
  if (created === null) throw new Error("Profil introuvable ou inaccessible depuis ce serveur.");
  const [liked, watchlist] = await Promise.all([
    section(`${root}likes/lists/`, "liked"),
    publicPage(`${root}watchlist/`),
  ]);
  const lists = [
    ...new Map([...(liked || []), ...created].map((item) => [item.url, item])).values(),
  ];
  const profile: Profile = {
    username,
    updatedAt: new Date().toISOString(),
    lists,
    watchlist: watchlist?.includes('data-component-class="LazyPoster"')
      ? { url: `${root}watchlist/`, title: "Watchlist", count: null, kind: "watchlist" }
      : null,
    unavailable: [liked === null ? "liked" : "", watchlist === null ? "watchlist" : ""].filter(
      Boolean,
    ),
  };
  await writeProfileCache(profile);
  return profile;
}
