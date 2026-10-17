import { handle } from "../../../lib/route";
import { searchMovies } from "../../../lib/tmdb";
import { parseSearch } from "../../../lib/validation";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handle(request, () => {
    const { title, year } = parseSearch(new URL(request.url).searchParams);
    return searchMovies(title, year);
  });
}
