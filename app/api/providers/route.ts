import { handle } from "@/lib/route";
import { getProviders } from "@/lib/tmdb";
import { parseLangOnly } from "@/lib/validation";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handle(request, () => getProviders(parseLangOnly(new URL(request.url).searchParams)));
}
