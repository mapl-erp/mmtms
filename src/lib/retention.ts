import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { canonicalize } from "./ledger";
import { appendLedger } from "./ledger";
import { retentionUntil } from "./accounts";
import type { Actor } from "./session";
import { parseSettings } from "./settings";
import { storagePut, storageGet } from "./storage";

export function pastRetention(recordDate: Date, now: Date, years: number): boolean {
  return retentionUntil(recordDate, years).getTime() < now.getTime();
}

async function seal(
  tx: Tx,
  actor: Actor,
  sourceTable: string,
  sourceId: string,
  payload: Record<string, unknown>,
) {
  const existing = await tx.archiveRecord.findFirst({
    where: { tenantId: actor.tenantId, sourceTable, sourceId },
  });
  if (existing) return existing;
  const sealedHash = createHash("sha256").update(canonicalize(payload)).digest("hex");
  const row = await tx.archiveRecord.create({
    data: { tenantId: actor.tenantId, sourceTable, sourceId, payload: payload as Prisma.InputJsonValue, sealedHash },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "archive.sealed",
    entityType: "archive_record",
    entityId: row.id,
    actorId: actor.id,
    payload: { sourceTable, sourceId, sealedHash },
  });
  return row;
}

export async function archiveDue(tx: Tx, actor: Actor, now = new Date()) {
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  let sealed = 0;
  const trips = await tx.trip.findMany({ where: { tenantId: actor.tenantId }, include: { proofs: { include: { file: true } } } });
  for (const trip of trips) {
    if (!pastRetention(trip.createdAt, now, settings.retentionYears)) continue;
    for (const proof of trip.proofs) {
      try {
        const bytes = await storageGet(proof.file.path);
        await storagePut(`archive/${proof.file.path}`, bytes, proof.file.mime);
      } catch {
        // The hash proof still records the file hash even if the bytes were already moved.
      }
    }
    await seal(tx, actor, "trips", trip.id, {
      number: trip.number,
      lrNumber: trip.lrNumber,
      origin: trip.origin,
      destination: trip.destination,
      freight: trip.freight.toString(),
      createdAt: trip.createdAt.toISOString(),
      files: trip.proofs.map((proof) => proof.file.sha256),
    });
    sealed += 1;
  }
  const invoices = await tx.invoice.findMany({ where: { tenantId: actor.tenantId } });
  for (const invoice of invoices) {
    if (!pastRetention(invoice.createdAt, now, settings.retentionYears)) continue;
    await seal(tx, actor, "invoices", invoice.id, {
      number: invoice.number,
      taxable: invoice.taxable.toString(),
      gstAmount: invoice.gstAmount.toString(),
      total: invoice.total.toString(),
      createdAt: invoice.createdAt.toISOString(),
    });
    sealed += 1;
  }
  return { sealed };
}
