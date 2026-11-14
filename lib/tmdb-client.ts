import { fetchWithRetry, type RetryOptions } from "@/lib/fetch-retry";
import { publicCache, type CacheEntry } from "@/lib/storage/public-cache";
import type { MovieDetails, MovieAvailability } from "@/lib/types";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const METADATA_TTL_MS = 7 * DAY_MS;
const FAILURE_COOLDOWN_MS = 60_000;
const MAX_CONCURRENT = 4;

type Flight = { controller: AbortController; promise: Promise<CacheEntry>; users: number };
const abortError = () => new DOMException("Aborted", "AbortError");
const fresh = (entry: CacheEntry | undefined, ttl: number) =>
  entry !== undefined && entry.at <= Date.now() && Date.now() - entry.at < ttl;

function availability(value: unknown): value is MovieAvailability {
  if (!value || typeof value !== "object") return false;
  const data = value as MovieAvailability;
  return (
    (data.availabilityStatus === "verified" || data.availabilityStatus === "unknown") &&
    (data.offersUrl === null || typeof data.offersUrl === "string") &&
    Array.isArray(data.offers) &&
    data.offers.every(
      (offer) =>
        offer &&
        typeof offer.id === "string" &&
        typeof offer.name === "string" &&
        typeof offer.type === "string" &&
        (offer.icon === null || typeof offer.icon === "string") &&
        (offer.url === null || typeof offer.url === "string"),
    )
  );
}
function movie(value: unknown): value is MovieDetails {
  if (!availability(value)) return false;
  const data = value as MovieDetails;
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  const nullableNumber = (value: unknown) =>
    value === null || (typeof value === "number" && Number.isFinite(value));
  return (
    Number.isSafeInteger(data.tmdbId) &&
    data.tmdbId > 0 &&
    typeof data.title === "string" &&
    nullableText(data.poster) &&
    nullableText(data.originalTitle) &&
    nullableText(data.overview) &&
    nullableNumber(data.year) &&
    nullableNumber(data.rating) &&
    nullableNumber(data.runtime) &&
    [data.genres, data.directors, data.cast].every(
      (values) => Array.isArray(values) && values.every((v) => typeof v === "string"),
    ) &&
    (data.trailer === null ||
      (typeof data.trailer?.key === "string" && nullableText(data.trailer.name)))
  );
}

function cacheKey(url: string) {
  const parsed = new URL(url, "https://cache.invalid");
  if (parsed.searchParams.get("lang") === "fr") parsed.searchParams.delete("lang");
  if (parsed.searchParams.get("region") === "FR") parsed.searchParams.delete("region");
  if (parsed.pathname === "/api/discover" && !parsed.searchParams.has("sort")) {
    parsed.searchParams.set("sort", "popularity");
  }
  for (const field of ["providers", "genres"]) {
    const value = parsed.searchParams.get(field);
    if (value) parsed.searchParams.set(field, [...new Set(value.split(","))].sort().join(","));
  }
  parsed.searchParams.sort();
  const query = parsed.searchParams.toString();
  return parsed.pathname + (query ? `?${query}` : "");
}

function resource(url: string, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (url.startsWith("/api/providers")) {
    return (
      Array.isArray(data.providers) &&
      data.providers.every(
        (provider) =>
          provider &&
          typeof provider.id === "string" &&
          typeof provider.name === "string" &&
          (provider.logo === null || typeof provider.logo === "string"),
      )
    );
  }
  if (url.startsWith("/api/discover") || url.startsWith("/api/search")) {
    return (
      Array.isArray(data.results) &&
      data.results.every(
        (item) =>
          item &&
          Number.isSafeInteger(item.tmdbId) &&
          item.tmdbId > 0 &&
          typeof item.title === "string" &&
          (item.poster === null || typeof item.poster === "string") &&
          (item.year === null || Number.isFinite(item.year)) &&
          (item.rating === null || Number.isFinite(item.rating)),
      ) &&
      (!url.startsWith("/api/discover") ||
        (Number.isInteger(data.page) && Number.isInteger(data.totalPages)))
    );
  }
  return true;
}

/** Shared by browsing and drawing; cached offers must be fresh before deciding what is watchable. */
export function createTmdbClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
  retry: Pick<RetryOptions, "sleep" | "baseDelayMs"> = {},
  cache = publicCache,
) {
  const flights = new Map<string, Flight>();
  const failures = new Map<string, { at: number; error: unknown }>();
  const waiting: Array<() => void> = [];
  let active = 0;
  let generation = 0;

  async function network(url: string, signal: AbortSignal) {
    await new Promise<void>((resolve) => {
      const start = () => {
        active += 1;
        resolve();
      };
      if (active < MAX_CONCURRENT) start();
      else waiting.push(start);
    });
    try {
      signal.throwIfAborted();
      const response = await fetchWithRetry(fetcher, url, {
        ...retry,
        signal,
        retryable: (status) => status >= 500,
      });
      return await response.json();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  function shared(
    url: string,
    load: (signal: AbortSignal) => Promise<CacheEntry>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    let flight = flights.get(url);
    if (!flight) {
      const controller = new AbortController();
      flight = {
        controller,
        users: 0,
        promise: Promise.resolve().then(() => load(controller.signal)),
      };
      const started = flight;
      flights.set(url, flight);
      void flight.promise
        .finally(() => {
          if (flights.get(url) === started) flights.delete(url);
        })
        .catch(() => undefined);
    }
    const current = flight;
    current.users += 1;
    return new Promise<CacheEntry>((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown, entry?: CacheEntry) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", aborted);
        current.users -= 1;
        if (current.users === 0) {
          current.controller.abort();
          if (flights.get(url) === current) flights.delete(url);
        }
        if (error) reject(error);
        else resolve(entry!);
      };
      const aborted = () => finish(abortError());
      signal?.addEventListener("abort", aborted, { once: true });
      current.promise.then(
        (entry) => finish(null, entry),
        (error) => finish(error),
      );
    });
  }

  function request(
    url: string,
    ttl: number,
    signal?: AbortSignal,
    validate: (value: unknown) => boolean = () => true,
  ) {
    const started = generation;
    const key = cacheKey(url);
    return shared(
      key,
      async (controller) => {
        const stored = await cache.read(key);
        controller.throwIfAborted();
        if (fresh(stored, ttl) && validate(stored!.data)) return stored!;
        const failure = failures.get(key);
        if (failure && Date.now() - failure.at < FAILURE_COOLDOWN_MS) throw failure.error;
        try {
          const data: unknown = await network(url, controller);
          controller.throwIfAborted();
          if (!validate(data)) throw new Error("Invalid film response");
          const entry = { key, at: Date.now(), data };
          if (started === generation) {
            failures.delete(key);
            await cache.write(entry);
          }
          return entry;
        } catch (error) {
          if (!controller.aborted && started === generation)
            failures.set(key, { at: Date.now(), error });
          if (failures.size > 2000) failures.delete(failures.keys().next().value!);
          throw error;
        }
      },
      signal,
    );
  }

  const offersUrl = (url: string) => url.replace(/(\/api\/movie\/\d+)(\?|$)/, "$1/offers$2");
  const combine = (data: MovieDetails, offers: MovieAvailability): MovieDetails => ({
    ...data,
    offers: offers.offers,
    availabilityStatus: offers.availabilityStatus,
    offersUrl: offers.offersUrl,
  });

  return {
    async get<T>(url: string, ttl = DAY_MS, signal?: AbortSignal): Promise<T> {
      return (await request(url, ttl, signal, (value) => resource(url, value))).data as T;
    },
    peekMovie(url: string): MovieDetails | undefined {
      const entry = cache.peek(cacheKey(url));
      const offers = cache.peek(cacheKey(offersUrl(url)));
      if (!fresh(entry, METADATA_TTL_MS) || !movie(entry?.data)) return;
      if (fresh(offers, DAY_MS) && availability(offers?.data) && offers.at >= entry!.at)
        return combine(entry.data, offers.data);
      if (fresh(entry, DAY_MS)) return entry.data;
    },
    /** What `getMovie` would answer from the cache, offers included, or nothing if it needs a request. */
    async readFreshMovie(url: string): Promise<MovieDetails | undefined> {
      const entry = await cache.read(cacheKey(url));
      if (!fresh(entry, METADATA_TTL_MS) || !movie(entry?.data)) return;
      if (fresh(entry, DAY_MS)) return entry.data;
      const offers = await cache.read(cacheKey(offersUrl(url)));
      if (fresh(offers, DAY_MS) && availability(offers?.data) && offers.at >= entry!.at) {
        return combine(entry.data, offers.data);
      }
    },
    async getMovie(url: string, signal?: AbortSignal): Promise<MovieDetails> {
      const started = generation;
      const id = Number(url.match(/\/api\/movie\/(\d+)/)?.[1]);
      const entry = await request(
        url,
        METADATA_TTL_MS,
        signal,
        (value) => movie(value) && value.tmdbId === id,
      );
      const detail = entry.data as MovieDetails;
      const storedOffers = await cache.read(cacheKey(offersUrl(url)));
      signal?.throwIfAborted();
      if (started !== generation) throw abortError();
      if (
        fresh(storedOffers, DAY_MS) &&
        availability(storedOffers?.data) &&
        storedOffers.at >= entry.at
      ) {
        return combine(detail, storedOffers.data);
      }
      if (fresh(entry, DAY_MS)) return detail;
      const offers = await request(offersUrl(url), DAY_MS, signal, availability);
      return combine(detail, offers.data as MovieAvailability);
    },
    retryFailures() {
      failures.clear();
    },
    async clear() {
      generation += 1;
      flights.forEach((flight) => flight.controller.abort());
      flights.clear();
      failures.clear();
      await cache.clear();
    },
  };
}

export const tmdbClient = createTmdbClient();
