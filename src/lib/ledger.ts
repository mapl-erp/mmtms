import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { Tx } from "./db";

export const GENESIS = "0".repeat(64);

export function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(",")}}`;
}

/** SHA-256 of the previous hash, the canonical payload, and the sorted file hashes. */
export function chainHash(prevHash: string, payload: unknown, fileHashes: string[]): string {
  const files = [...fileHashes].sort().join(",");
  const material = `${prevHash}\n${canonicalize(payload)}\n${files}`;
  return createHash("sha256").update(material).digest("hex");
}

export function sha256Bytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type AppendInput = {
  tenantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  payload: Record<string, unknown>;
  fileHashes?: string[];
};

export async function appendLedger(tx: Tx, input: AppendInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`;
  const last = await tx.ledgerEvent.findFirst({
    where: { tenantId: input.tenantId },
    orderBy: { seq: "desc" },
  });
  const prevHash = last?.hash ?? GENESIS;
  const fileHashes = [...(input.fileHashes ?? [])].sort();
  const payload = JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue;
  const hash = chainHash(prevHash, payload, fileHashes);
  return tx.ledgerEvent.create({
    data: {
      tenantId: input.tenantId,
      seq: (last?.seq ?? 0) + 1,
      prevHash,
      hash,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      payload,
      fileHashes,
    },
  });
}
