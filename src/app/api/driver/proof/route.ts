import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { actorFrom, readSession } from "@/lib/session";
import { addProof } from "@/lib/trips";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json()) as {
    tripId?: string;
    kind?: string;
    dataUrl?: string;
    capture?: "camera" | "stamped_still";
    lat?: number | null;
    lng?: number | null;
  };
  const match = body.dataUrl?.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!body.tripId || !body.kind || !match || !body.capture) {
    return NextResponse.json({ error: "Proof payload is incomplete" }, { status: 400 });
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 4_000_000) return NextResponse.json({ error: "Photo is too large" }, { status: 400 });
  const result = await withTenant(session.tid, (tx) =>
    addProof(tx, actorFrom(session), {
      tripId: body.tripId!,
      kind: body.kind!,
      bytes,
      mime: match[1],
      capture: body.capture!,
      lat: body.lat,
      lng: body.lng,
    }),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.data.id });
}
