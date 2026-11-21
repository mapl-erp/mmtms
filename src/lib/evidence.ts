import JSZip from "jszip";
import type { Tx } from "./db";
import { renderLr } from "./pdf";
import { storageGet } from "./storage";

export async function evidenceZip(tx: Tx, tenantId: string, tripId: string): Promise<{ name: string; bytes: Buffer } | null> {
  const trip = await tx.trip.findFirst({
    where: { id: tripId, tenantId },
    include: {
      truck: true,
      driver: true,
      customer: true,
      consignor: true,
      consignee: true,
      proofs: { include: { file: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!trip) return null;
  const events = await tx.ledgerEvent.findMany({
    where: { tenantId },
    orderBy: { seq: "asc" },
  });
  const related = events.filter((event) => {
    const payload = JSON.stringify(event.payload);
    return event.entityId === trip.id || payload.includes(trip.number) || trip.proofs.some((proof) => proof.id === event.entityId);
  });
  const zip = new JSZip();
  const lr = await renderLr(trip);
  zip.file("lr.pdf", lr);
  const folder = zip.folder("proofs");
  const manifest: { kind: string; sha256: string; capture: string; file: string }[] = [];
  for (const proof of trip.proofs) {
    const bytes = await storageGet(proof.file.path);
    const filename = `${proof.kind.toLowerCase()}-${proof.file.sha256.slice(0, 10)}${proof.file.path.endsWith(".svg") ? ".svg" : proof.file.path.endsWith(".png") ? ".png" : ".jpg"}`;
    folder?.file(filename, bytes);
    manifest.push({ kind: proof.kind, sha256: proof.file.sha256, capture: proof.capture, file: `proofs/${filename}` });
  }
  zip.file(
    "ledger.json",
    JSON.stringify(
      related.map((event) => ({
        seq: event.seq,
        eventType: event.eventType,
        hash: event.hash,
        prevHash: event.prevHash,
        payload: event.payload,
        fileHashes: event.fileHashes,
        createdAt: event.createdAt,
      })),
      null,
      2,
    ),
  );
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        trip: trip.number,
        lr: trip.lrNumber,
        truck: trip.truck.regNo,
        proofs: manifest,
        ledgerEvents: related.length,
      },
      null,
      2,
    ),
  );
  const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  return { name: `${trip.number}-evidence.zip`, bytes };
}
