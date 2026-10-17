import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getJob(id);
  return job
    ? Response.json(job)
    : Response.json({ error: "Import introuvable." }, { status: 404 });
}
