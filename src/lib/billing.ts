import type { Actor } from "./session";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { round2 } from "./format";

export type GstMode = "FIVE_NO_ITC" | "EIGHTEEN_ITC";

export function gstBreakdown(mode: GstMode, taxable: number) {
  if (mode === "FIVE_NO_ITC") {
    const gstAmount = round2(taxable * 0.05);
    return { gstRate: 5, gstAmount, total: round2(taxable + gstAmount), itcEligible: false };
  }
  const gstAmount = round2(taxable * 0.18);
  return { gstRate: 18, gstAmount, total: round2(taxable + gstAmount), itcEligible: true };
}

export function tallyCsv(
  rows: {
    number: string;
    createdAt: Date;
    party: string;
    trip: string;
    taxable: string;
    gstRate: string;
    gstAmount: string;
    itcEligible: boolean;
    total: string;
  }[],
): string {
  const header = ["Voucher Number", "Date", "Party", "Trip", "Taxable", "GST Rate", "GST Amount", "ITC", "Total"];
  const lines = rows.map((row) =>
    [
      row.number,
      row.createdAt.toISOString().slice(0, 10),
      row.party,
      row.trip,
      row.taxable,
      row.gstRate,
      row.gstAmount,
      row.itcEligible ? "Yes" : "No",
      row.total,
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export async function createInvoice(
  tx: Tx,
  actor: Actor,
  input: { partyId: string; tripId?: string | null; taxable: number; gstMode: GstMode },
) {
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(actor.role)) {
    return { ok: false as const, error: "Billing is for the desk" };
  }
  const party = await tx.party.findFirst({ where: { id: input.partyId, tenantId: actor.tenantId } });
  if (!party) return { ok: false as const, error: "Party not found" };
  const count = await tx.invoice.count({ where: { tenantId: actor.tenantId } });
  const number = `INV-${String(count + 1).padStart(4, "0")}`;
  const gst = gstBreakdown(input.gstMode, input.taxable);
  const invoice = await tx.invoice.create({
    data: {
      tenantId: actor.tenantId,
      number,
      tripId: input.tripId || null,
      partyId: party.id,
      taxable: input.taxable.toFixed(2),
      gstMode: input.gstMode,
      gstRate: gst.gstRate.toFixed(2),
      gstAmount: gst.gstAmount.toFixed(2),
      total: gst.total.toFixed(2),
      itcEligible: gst.itcEligible,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    actorId: actor.id,
    payload: {
      number,
      party: party.name,
      taxable: input.taxable.toFixed(2),
      gstMode: input.gstMode,
      gstRate: gst.gstRate.toFixed(2),
      gstAmount: gst.gstAmount.toFixed(2),
      total: gst.total.toFixed(2),
      itcEligible: gst.itcEligible,
    },
  });
  return { ok: true as const, data: invoice };
}
