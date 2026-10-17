import { handle } from "../../../lib/route";
import { getProviders } from "../../../lib/tmdb";
import { parseNoParams } from "../../../lib/validation";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handle(request, () => {
    parseNoParams(new URL(request.url).searchParams);
    return getProviders();
  });
}
