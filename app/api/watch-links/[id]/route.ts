import { handle } from "@/lib/route";
import { parseMovieId, parseRegionOnly } from "@/lib/validation";
import { getWatchLinks } from "@/lib/watchmode";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(request, async () => {
    const region = parseRegionOnly(new URL(request.url).searchParams);
    const links = await getWatchLinks(parseMovieId(id), region);
    // `resolved` tells the browser whether an empty list is an answer worth remembering.
    return { links: links ?? {}, resolved: links !== null };
  });
}
