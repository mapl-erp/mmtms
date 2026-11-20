import { can } from "./access";
import type { Actor } from "./session";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";

export async function registerDocument(
  tx: Tx,
  actor: Actor,
  input: { truckId: string; docType: string; docNumber: string; expiresOn: string },
) {
  if (!can(actor, "fleet.manage")) {
    return { ok: false as const, error: "Only the desk can file a document" };
  }
  const truck = await tx.truck.findFirst({ where: { id: input.truckId, tenantId: actor.tenantId } });
  if (!truck) return { ok: false as const, error: "Truck not found" };
  const expires = new Date(`${input.expiresOn}T00:00:00.000Z`);
  if (Number.isNaN(expires.getTime())) return { ok: false as const, error: "Enter a valid expiry date" };
  const doc = await tx.truckDocument.create({
    data: {
      tenantId: actor.tenantId,
      truckId: truck.id,
      docType: input.docType,
      docNumber: input.docNumber.trim(),
      expiresOn: expires,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "document.filed",
    entityType: "truck_document",
    entityId: doc.id,
    actorId: actor.id,
    payload: {
      truck: truck.regNo,
      docType: input.docType,
      docNumber: doc.docNumber,
      expiresOn: input.expiresOn,
    },
  });
  return { ok: true as const, data: doc };
}
