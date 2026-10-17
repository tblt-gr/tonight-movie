import { isIP } from "node:net";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 600;
const MAX_TRACKED = 10_000;
const OVERFLOW_KEY = "overflow";

type Counter = { count: number; resetAt: number };

// Best effort: counters live in this process only, so serverless instances do
// not share them and a restart resets them.
const counters = new Map<string, Counter>();
let lastSweep = 0;

/** Expands any valid IPv6 text to 8 groups; an IPv4-mapped address keys as its IPv4. */
function ipv6Key(address: string): string {
  let text = address.split("%")[0].toLowerCase();
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (tail) {
    const [a, b, c, d] = tail.split(".").map(Number);
    text =
      text.slice(0, -tail.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest ? rest.split(":") : [];
  const groups = text.includes("::")
    ? [...front, ...Array(8 - front.length - back.length).fill("0"), ...back]
    : front;
  const hex = groups.map((group) => group.padStart(4, "0"));
  if (hex.slice(0, 5).every((g) => g === "0000") && hex[5] === "ffff") {
    const high = parseInt(hex[6], 16);
    const low = parseInt(hex[7], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  // One subscriber usually owns a whole /64, so it must not get a fresh bucket per address.
  return `${hex.slice(0, 4).join(":")}::/64`;
}

/**
 * `x-forwarded-for` is only trustworthy for the entries our own proxies append.
 * `TRUSTED_PROXY_HOPS` says how many there are (default 1); the client address is
 * the entry that many positions from the right. With 0 the headers are ignored
 * and every caller shares one bucket.
 */
export function clientKey(request: Request): string {
  const configured = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  const hops = Number.isInteger(configured) && configured >= 0 ? configured : 1;
  if (hops === 0) return "shared";
  const raw = request.headers.get("x-forwarded-for")?.split(",").at(-hops)?.trim() ?? "";
  // Proxies may append a port or bracket an IPv6 address.
  const entry = raw
    .replace(/^\[([^\]]+)\](:\d+)?$/, "$1")
    .replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  if (isIP(entry) === 4) return entry;
  if (isIP(entry) === 6) return ipv6Key(entry);
  return "unknown";
}

function limitPerWindow(): number {
  const configured = Number(process.env.RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_LIMIT;
}

/** Returns the seconds to wait when the caller is over the limit, otherwise `null`. */
export function checkRateLimit(key: string, now = Date.now()): number | null {
  if (counters.size >= MAX_TRACKED && now - lastSweep >= WINDOW_MS) {
    lastSweep = now;
    for (const [tracked, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(tracked);
    }
  }
  // Never evict live counters: overflow callers share one bucket with the same limit.
  const bucket = !counters.has(key) && counters.size >= MAX_TRACKED ? OVERFLOW_KEY : key;
  const current = counters.get(bucket);
  if (!current || current.resetAt <= now) {
    counters.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  current.count += 1;
  return current.count > limitPerWindow() ? Math.ceil((current.resetAt - now) / 1000) : null;
}

export function resetRateLimit() {
  counters.clear();
  lastSweep = 0;
}
