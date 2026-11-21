import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { actorFrom, readSession } from "@/lib/session";
import { recordBreath } from "@/lib/safety";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json()) as { testId?: string; passed?: boolean };
  if (!body.testId) return NextResponse.json({ error: "Test is missing" }, { status: 400 });
  const result = await withTenant(session.tid, (tx) => recordBreath(tx, actorFrom(session), { testId: body.testId!, passed: Boolean(body.passed) }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
