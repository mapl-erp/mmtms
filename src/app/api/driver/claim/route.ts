import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { submitClaim } from "@/lib/expenses";
import { actorFrom, readSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session?.driverId) return NextResponse.json({ error: "Sign in as a driver" }, { status: 401 });
  const body = (await request.json()) as {
    tripId?: string;
    category?: "TOLL" | "LABOUR" | "FOOD" | "PARKING" | "REPAIR" | "FINE";
    amount?: number;
    claimedOn?: string;
    note?: string;
    lat?: number;
    lng?: number;
    capturedAt?: string;
    dataUrl?: string;
  };
  const match = body.dataUrl?.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: "A claim needs a receipt photo tagged with GPS and time" }, { status: 400 });
  }
  const result = await withTenant(session.tid, (tx) =>
    submitClaim(tx, { ...actorFrom(session), role: "DRIVER" }, {
      driverId: session.driverId!,
      tripId: body.tripId,
      category: body.category ?? "TOLL",
      amount: Number(body.amount ?? 0),
      claimedOn: body.claimedOn || new Date().toISOString().slice(0, 10),
      note: body.note,
      lat: body.lat,
      lng: body.lng,
      capturedAt: body.capturedAt || new Date().toISOString(),
      receipt: { bytes: Buffer.from(match[2], "base64"), mime: match[1] },
    }),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.data.id });
}
