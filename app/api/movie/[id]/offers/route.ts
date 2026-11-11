import { handle } from "@/lib/route";
import { getMovieOffers } from "@/lib/tmdb";
import { parseContext, parseMovieId } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(request, () => {
    const { region } = parseContext(new URL(request.url).searchParams);
    return getMovieOffers(parseMovieId(id), region);
  });
}
