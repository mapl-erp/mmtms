import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { actorFrom, readSession } from "@/lib/session";
import { verifyPodOtp } from "@/lib/trips";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json()) as { tripId?: string; otp?: string };
  if (!body.tripId || !body.otp) return NextResponse.json({ error: "OTP is missing" }, { status: 400 });
  const result = await withTenant(session.tid, (tx) => verifyPodOtp(tx, actorFrom(session), body.tripId!, body.otp!));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
