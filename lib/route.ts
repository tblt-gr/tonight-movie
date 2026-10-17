import { ApiFailure } from "@/lib/errors";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/** Shared wrapper: rate limit first, then run, and turn every failure into a typed error body. */
export async function handle(request: Request, run: () => Promise<unknown>): Promise<Response> {
  const retryAfter = checkRateLimit(clientKey(request));
  if (retryAfter !== null) {
    const failure = new ApiFailure("rate_limited", 429, "Too many requests, try again shortly");
    return Response.json(failure.toBody(), {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }
  try {
    return Response.json(await run());
  } catch (error) {
    if (error instanceof ApiFailure) {
      return Response.json(error.toBody(), {
        status: error.status,
        headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      });
    }
    // Only the error name is logged: messages and URLs could carry the key.
    console.error("Unhandled route error:", error instanceof Error ? error.name : "unknown");
    const failure = new ApiFailure("internal", 500, "Unexpected server error");
    return Response.json(failure.toBody(), { status: 500 });
  }
}
