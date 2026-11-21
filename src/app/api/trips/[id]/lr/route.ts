import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { renderLr } from "@/lib/pdf";
import { readSession } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await context.params;
  const trip = await withTenant(session.tid, (tx) =>
    tx.trip.findFirst({
      where: { id, tenantId: session.tid },
      include: { truck: true, driver: true, customer: true, consignor: true, consignee: true },
    }),
  );
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderLr(trip);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${trip.lrNumber ?? trip.number}.pdf"`,
    },
  });
}
