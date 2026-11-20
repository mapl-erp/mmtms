import type { Actor } from "./session";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";

export async function completeJob(tx: Tx, actor: Actor, jobId: string) {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    return { ok: false as const, error: "Only the desk can close a job card" };
  }
  const job = await tx.workshopJob.findFirst({
    where: { id: jobId, tenantId: actor.tenantId },
    include: { truck: true },
  });
  if (!job) return { ok: false as const, error: "Job not found" };
  await tx.workshopJob.update({ where: { id: job.id }, data: { status: "done" } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "workshop.completed",
    entityType: "workshop_job",
    entityId: job.id,
    actorId: actor.id,
    payload: { truck: job.truck.regNo, title: job.title, cost: job.cost.toString() },
  });
  return { ok: true as const, data: { status: "done" } };
}
