const RETRIES = 3;
const BASE_DELAY_MS = 1500;
/** A long Retry-After would freeze the visitor's screen; the pause is capped here. */
const MAX_DELAY_MS = 10_000;

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  signal?: AbortSignal;
  /** Statuses worth another try; a 429 always is. */
  retryable?: (status: number) => boolean;
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function delayFor(response: Response, attempt: number, baseDelayMs: number) {
  const seconds = Number(response.headers.get("Retry-After"));
  const hinted = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  return Math.min(Math.max(hinted, baseDelayMs * 2 ** attempt), MAX_DELAY_MS);
}

/**
 * Fetches a URL from the app's own routes, which are rate limited per visitor: a 429 (and any
 * other `retryable` status) is retried with a growing pause, honoring Retry-After, before the
 * request is given up. Returns the first OK response and throws otherwise.
 */
export async function fetchWithRetry(
  fetcher: typeof fetch,
  url: string,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    signal,
    retryable = () => false,
    retries = RETRIES,
    baseDelayMs = BASE_DELAY_MS,
    sleep = wait,
  } = options;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetcher(url, { signal });
    if (response.ok) return response;
    const again = response.status === 429 || retryable(response.status);
    if (!again || attempt >= retries) throw new Error(`Request failed with ${response.status}`);
    await sleep(delayFor(response, attempt, baseDelayMs));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }
}
