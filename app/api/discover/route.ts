import { handle } from "../../../lib/route";
import { discoverMovies } from "../../../lib/tmdb";
import { parseDiscover } from "../../../lib/validation";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handle(request, () => {
    const { providers, maxRuntime, page } = parseDiscover(new URL(request.url).searchParams);
    return discoverMovies(providers, maxRuntime, page);
  });
}
