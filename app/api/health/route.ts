import { isTmdbConfigured, MISSING_KEY_MESSAGE } from "../../../lib/tmdb";

export const runtime = "nodejs";

export function GET() {
  if (!isTmdbConfigured()) {
    return Response.json(
      { ok: false, checks: { tmdb: { ok: false, detail: MISSING_KEY_MESSAGE } } },
      { status: 503 },
    );
  }
  return Response.json({ ok: true, checks: { tmdb: { ok: true } } });
}
