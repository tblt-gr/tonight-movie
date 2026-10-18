import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { fetchProviderLogo } from "@/lib/tmdb";

export const runtime = "nodejs";

/**
 * A provider logo served from our own origin, so the browser may read its pixels to find
 * the brand color. Only a bare TMDB file name is accepted.
 */
export async function GET(request: Request) {
  const retryAfter = checkRateLimit(clientKey(request));
  if (retryAfter !== null) {
    return new Response(null, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  const file = new URL(request.url).searchParams.get("file") ?? "";
  const logo = await fetchProviderLogo(file);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(logo.body, {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
