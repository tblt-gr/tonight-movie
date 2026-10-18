import { handle } from "@/lib/route";
import { parseMovieId, parseNoParams } from "@/lib/validation";
import { getWatchLinks } from "@/lib/watchmode";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(request, async () => {
    parseNoParams(new URL(request.url).searchParams);
    const links = await getWatchLinks(parseMovieId(id));
    // `resolved` tells the browser whether an empty list is an answer worth remembering.
    return { links: links ?? {}, resolved: links !== null };
  });
}
