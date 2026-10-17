import { startImport } from "@/lib/jobs";
import { canonicalListUrl } from "@/lib/source";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096)
      return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
    const payload = (await request.json()) as { url?: unknown; force?: unknown };
    const url = canonicalListUrl(payload.url);
    const result = await startImport(url, payload.force === true);
    return Response.json(result, { status: result.state === "done" ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import impossible.";
    return Response.json(
      { error: message },
      { status: message.includes("Deux imports") ? 429 : 400 },
    );
  }
}
