import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { actorFrom, readSession } from "@/lib/session";
import { setSeal } from "@/lib/trips";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json()) as { tripId?: string; seal?: string };
  if (!body.tripId || !body.seal) return NextResponse.json({ error: "Seal is missing" }, { status: 400 });
  const result = await withTenant(session.tid, (tx) => setSeal(tx, actorFrom(session), body.tripId!, body.seal!));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ sealNumber: result.data.sealNumber });
}
