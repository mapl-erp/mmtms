import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { recordPayment, retentionUntil } from "@/lib/accounts";
import { createInvoice, gstBreakdown, tallyCsv } from "@/lib/billing";
import { prisma, withTenant } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const admin = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL });

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await admin.paymentAllocation.deleteMany({ where: { tenantId } });
    await admin.payment.deleteMany({ where: { tenantId } });
    await admin.purchase.deleteMany({ where: { tenantId } });
    await admin.outboxMail.deleteMany({ where: { tenantId } });
    await admin.invoice.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
    await admin.party.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  } finally {
    await admin.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);
  }
}

afterAll(async () => {
  await prisma.$disconnect();
  await admin.$disconnect();
});

describe("18% GST, receipts, and retention", () => {
  it("invoices at 18% with ITC, matches a receipt, and keeps the Tally row", async () => {
    const tenant = await admin.tenant.create({ data: { slug: `gst-${randomUUID().slice(0, 8)}`, name: "GST", settings: DEFAULT_SETTINGS } });
    const party = await admin.party.create({ data: { tenantId: tenant.id, name: "Ganesh Steel", kind: "customer", tags: ["customer"] } });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "ACCOUNTANT", name: "A", driverId: null };
    try {
      const invoice = await withTenant(tenant.id, (tx) =>
        createInvoice(tx, actor, { partyId: party.id, taxable: 10000, gstMode: "FIVE_NO_ITC" }),
      );
      expect(invoice.ok).toBe(true);
      if (!invoice.ok) return;
      expect(invoice.data.gstMode).toBe("EIGHTEEN_ITC");
      expect(Number(invoice.data.gstRate)).toBe(18);
      expect(invoice.data.itcEligible).toBe(true);
      expect(invoice.data.externalId).toBe(`SIM-${invoice.data.number}`);
      expect(gstBreakdown("EIGHTEEN_ITC", 10000).total).toBe(11800);
      const payment = await withTenant(tenant.id, (tx) =>
        recordPayment(tx, actor, {
          partyId: party.id,
          invoiceId: invoice.data.id,
          amount: 5000,
          method: "NEFT",
          reference: "UTR1",
          receivedOn: "2026-11-20",
        }),
      );
      expect(payment.ok && payment.data.matched).toBe(5000);
      const open = await withTenant(tenant.id, async (tx) => {
        const row = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.data.id }, include: { allocations: true } });
        return Number(row.total) - row.allocations.reduce((sum, item) => sum + Number(item.amount), 0);
      });
      expect(open).toBe(6800);
      const csv = tallyCsv([
        {
          number: invoice.data.number,
          createdAt: invoice.data.createdAt,
          party: "Ganesh Steel",
          trip: "",
          taxable: "10000",
          gstRate: "18",
          gstAmount: "1800",
          itcEligible: true,
          total: "11800",
        },
      ]);
      expect(csv).toContain(invoice.data.number);
      expect(csv).toContain("Yes");
    } finally {
      await wipe(tenant.id);
    }
  });

  it("keeps the current year until six years after the GSTR-9 due date", () => {
    expect(retentionUntil(new Date("2026-11-20T00:00:00.000Z")).toISOString().slice(0, 10)).toBe("2033-12-31");
  });
});
