import { NextResponse } from "next/server";
import { tallyCsv } from "@/lib/billing";
import { withTenant } from "@/lib/db";
import { readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const invoices = await withTenant(session.tid, (tx) =>
    tx.invoice.findMany({
      where: { tenantId: session.tid },
      include: { party: true, trip: true },
      orderBy: { number: "asc" },
    }),
  );
  const csv = tallyCsv(
    invoices.map((invoice) => ({
      number: invoice.number,
      createdAt: invoice.createdAt,
      party: invoice.party.name,
      trip: invoice.trip?.number ?? "",
      taxable: invoice.taxable.toString(),
      gstRate: invoice.gstRate.toString(),
      gstAmount: invoice.gstAmount.toString(),
      itcEligible: invoice.itcEligible,
      total: invoice.total.toString(),
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=mighty-movers-tally.csv",
    },
  });
}
