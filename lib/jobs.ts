import { randomBytes } from "node:crypto";
import { buildSnapshot } from "./source";
import { knownFilms, readListCache, writeListCache } from "./storage";
import type { Snapshot } from "./types";

type Job = {
  state: "queued" | "running" | "done" | "error";
  done: number;
  total: number;
  source: string;
  error?: string;
  finished?: number;
};
type Registry = { jobs: Map<string, Job>; byUrl: Map<string, string> };
const globalJobs = globalThis as typeof globalThis & { filmImportJobs?: Registry };
const registry = (globalJobs.filmImportJobs ||= { jobs: new Map(), byUrl: new Map() });

function prune(): void {
  for (const [id, job] of registry.jobs)
    if (job.finished && Date.now() - job.finished > 30 * 60 * 1000) {
      registry.jobs.delete(id);
      if (registry.byUrl.get(job.source) === id) registry.byUrl.delete(job.source);
    }
}

export async function getJob(id: string): Promise<(Job & { snapshot?: Snapshot | null }) | null> {
  prune();
  const job = registry.jobs.get(id);
  if (!job) return null;
  const publicJob = { ...job };
  delete publicJob.finished;
  if (job.state === "done") return { ...publicJob, snapshot: await readListCache(job.source) };
  return publicJob;
}

export async function startImport(
  url: string,
  force: boolean,
): Promise<{ state: "done"; snapshot: Snapshot } | { state: "queued" | "running"; jobId: string }> {
  prune();
  if (!force) {
    const cached = await readListCache(url);
    if (cached) return { state: "done", snapshot: cached };
  }
  const prior = registry.byUrl.get(url);
  if (prior && ["queued", "running"].includes(registry.jobs.get(prior)?.state || ""))
    return { state: "running", jobId: prior };
  if (
    [...registry.jobs.values()].filter((job) => job.state === "queued" || job.state === "running")
      .length >= 2
  )
    throw new Error("Deux imports sont déjà en cours. Réessayez dans un instant.");
  const jobId = randomBytes(12).toString("base64url");
  const job: Job = { state: "queued", done: 0, total: 0, source: url };
  registry.jobs.set(jobId, job);
  registry.byUrl.set(url, jobId);
  void (async () => {
    try {
      const known = force ? undefined : await knownFilms();
      const snapshot = await buildSnapshot(
        url,
        (done, total) => Object.assign(job, { done, total, state: "running" }),
        known,
      );
      await writeListCache(snapshot);
      Object.assign(job, { state: "done", finished: Date.now() });
    } catch (error) {
      Object.assign(job, {
        state: "error",
        error: error instanceof Error ? error.message : "Import impossible.",
        finished: Date.now(),
      });
    }
  })();
  return { state: "queued", jobId };
}
