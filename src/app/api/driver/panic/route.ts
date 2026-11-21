import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { panic } from "@/lib/devices";
import { actorFrom, readSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { tripId?: string };
  const result = await withTenant(session.tid, (tx) => panic(tx, actorFrom(session), body.tripId ?? null));
  return NextResponse.json(result);
}
