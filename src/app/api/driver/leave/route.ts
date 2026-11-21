import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { actorFrom, readSession } from "@/lib/session";
import { applyLeave } from "@/lib/safety";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session?.driverId) return NextResponse.json({ error: "Sign in as a driver" }, { status: 401 });
  const body = (await request.json()) as { startsOn?: string; endsOn?: string; reason?: string };
  const result = await withTenant(session.tid, (tx) =>
    applyLeave(tx, actorFrom(session), {
      driverId: session.driverId!,
      startsOn: body.startsOn ?? "",
      endsOn: body.endsOn ?? "",
      reason: body.reason ?? "",
    }),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ id: result.data.id });
}
