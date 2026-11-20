import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Tx } from "./db";
import { GENESIS, chainHash } from "./ledger";

export type ChainRow = {
  seq: number;
  prevHash: string;
  hash: string;
  payload: unknown;
  fileHashes: string[];
  eventType?: string;
  createdAt?: Date;
};

export type ChainBreak = { seq: number; reason: string };

export function verifyEvents(events: ChainRow[]): ChainBreak[] {
  const breaks: ChainBreak[] = [];
  let prev = GENESIS;
  let prevSeq = 0;
  for (const event of events) {
    if (event.seq !== prevSeq + 1) {
      breaks.push({ seq: event.seq, reason: `sequence jumped from ${prevSeq} to ${event.seq}` });
    }
    if (event.prevHash !== prev) {
      breaks.push({ seq: event.seq, reason: "previous hash does not match the prior event" });
    }
    const expected = chainHash(event.prevHash, event.payload, event.fileHashes);
    if (expected !== event.hash) {
      breaks.push({ seq: event.seq, reason: "hash does not match the payload and file hashes" });
    }
    prev = event.hash;
    prevSeq = event.seq;
  }
  return breaks;
}

export function uploadPath(relative: string): string {
  const root = path.resolve(process.cwd(), "data", "uploads");
  const abs = path.resolve(root, relative);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("file path escapes the upload directory");
  }
  return abs;
}

export async function verifyTenant(tx: Tx, tenantId: string) {
  const events = await tx.ledgerEvent.findMany({
    where: { tenantId },
    orderBy: { seq: "asc" },
  });
  const rows: ChainRow[] = events.map((event) => ({
    seq: event.seq,
    prevHash: event.prevHash,
    hash: event.hash,
    payload: event.payload,
    fileHashes: event.fileHashes,
    eventType: event.eventType,
    createdAt: event.createdAt,
  }));
  const breaks = verifyEvents(rows);
  for (const event of rows) {
    for (const hash of event.fileHashes) {
      const file = await tx.storedFile.findFirst({ where: { tenantId, sha256: hash } });
      if (!file) {
        breaks.push({ seq: event.seq, reason: `missing media ${hash.slice(0, 12)}` });
        continue;
      }
      const bytes = await readFile(uploadPath(file.path));
      const got = createHash("sha256").update(bytes).digest("hex");
      if (got !== hash) {
        breaks.push({ seq: event.seq, reason: `media hash mismatch ${hash.slice(0, 12)}` });
      }
    }
  }
  return { ok: breaks.length === 0, breaks, events: rows, count: rows.length };
}
