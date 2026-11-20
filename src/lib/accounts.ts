import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { booksPort } from "./books";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { financialYear } from "./lifecycle";
import type { Actor } from "./session";
import { parseSettings } from "./settings";

export function retentionUntil(date = new Date(), years = 6): Date {
  const fy = financialYear(date);
  const start = 2000 + Number(fy.slice(0, 2));
  return new Date(Date.UTC(start + 1 + years, 11, 31));
}

export async function captureItc(
  tx: Tx,
  actor: Actor,
  input: { vendorName: string; category: string; taxable: number; sourceType: string; sourceId: string },
) {
  const gstRate = 18;
  const itcAmount = Math.round(input.taxable * 0.18 * 100) / 100;
  const purchase = await tx.purchase.create({
    data: {
      tenantId: actor.tenantId,
      vendorName: input.vendorName,
      category: input.category,
      taxable: input.taxable.toFixed(2),
      gstRate: gstRate.toFixed(2),
      itcAmount: itcAmount.toFixed(2),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "purchase.itc",
    entityType: "purchase",
    entityId: purchase.id,
    actorId: actor.id,
    payload: { vendor: input.vendorName, category: input.category, itcAmount: itcAmount.toFixed(2) },
  });
  return purchase;
}

export async function recordPayment(
  tx: Tx,
  actor: Actor,
  input: { partyId: string; invoiceId?: string | null; amount: number; method: "NEFT" | "UPI" | "CHEQUE"; reference: string; receivedOn: string },
) {
  const party = await tx.party.findFirst({ where: { id: input.partyId, tenantId: actor.tenantId } });
  if (!party) return { ok: false as const, error: "Party not found" };
  const payment = await tx.payment.create({
    data: {
      tenantId: actor.tenantId,
      partyId: party.id,
      amount: input.amount.toFixed(2),
      method: input.method,
      reference: input.reference.trim(),
      receivedOn: new Date(`${input.receivedOn}T00:00:00.000Z`),
    },
  });
  let matched = 0;
  if (input.invoiceId) {
    const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, tenantId: actor.tenantId, partyId: party.id } });
    if (!invoice) return { ok: false as const, error: "Invoice is not for this party" };
    const already = await tx.paymentAllocation.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    const open = Number(invoice.total) - Number(already._sum.amount ?? 0);
    matched = Math.min(input.amount, Math.max(0, open));
    if (matched > 0) {
      await tx.paymentAllocation.create({
        data: { tenantId: actor.tenantId, paymentId: payment.id, invoiceId: invoice.id, amount: matched.toFixed(2) },
      });
    }
  }
  const books = await booksPort().pushPayment({ reference: payment.reference, amount: input.amount.toFixed(2), party: party.name });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "payment.received",
    entityType: "payment",
    entityId: payment.id,
    actorId: actor.id,
    payload: { party: party.name, method: input.method, amount: input.amount.toFixed(2), matched: matched.toFixed(2), books: books.externalId },
  });
  return { ok: true as const, data: { id: payment.id, matched, books } };
}

export async function composeDailySummary(tx: Tx, tenantId: string) {
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings);
  const trips = await tx.trip.findMany({ where: { tenantId, status: { in: ["LOADING", "IN_TRANSIT"] } }, include: { truck: true } });
  const alerts = await tx.alert.count({ where: { tenantId, acknowledgedAt: null } });
  const invoices = await tx.invoice.findMany({ where: { tenantId }, include: { allocations: true } });
  const open = invoices.reduce((sum, invoice) => sum + Number(invoice.total) - invoice.allocations.reduce((inner, row) => inner + Number(row.amount), 0), 0);
  const subject = `Mighty Movers daily summary`;
  const body = [
    `Open duties: ${trips.map((trip) => `${trip.number} ${trip.truck.regNo} ${trip.status}`).join("; ") || "none"}`,
    `Unacknowledged alerts: ${alerts}`,
    `Receivables still open: ₹${open.toFixed(2)}`,
    `Overspeed threshold: ${settings.overspeedKmh} km/h`,
    `Records stay sealed until ${retentionUntil().toISOString().slice(0, 10)} for the current financial year.`,
  ].join("\n");
  return { subject, body };
}

export async function sendDailySummary(tx: Tx, actor: Actor) {
  const message = await composeDailySummary(tx, actor.tenantId);
  const row = await tx.outboxMail.create({
    data: { tenantId: actor.tenantId, subject: message.subject, body: message.body },
  });
  const dir = path.join(process.cwd(), "data", "outbox");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${row.id}.eml`), `Subject: ${message.subject}\n\n${message.body}\n`);
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "email.summary",
    entityType: "outbox_mail",
    entityId: row.id,
    actorId: actor.id,
    payload: { subject: message.subject },
  });
  return { ok: true as const, data: row };
}
