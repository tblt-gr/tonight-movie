import { handle } from "../../../../lib/route";
import { getMovie } from "../../../../lib/tmdb";
import { parseMovieId, parseNoParams } from "../../../../lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(request, () => {
    parseNoParams(new URL(request.url).searchParams);
    return getMovie(parseMovieId(id));
  });
}
