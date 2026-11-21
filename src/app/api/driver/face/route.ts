import { NextResponse } from "next/server";
import { faceMatcher } from "@/lib/notify";
import { readSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await request.json()) as { dataUrl?: string; reference?: string };
  const live = Buffer.from((body.dataUrl ?? "").split(",")[1] ?? "", "base64");
  const reference = body.reference ? Buffer.from(body.reference, "base64") : Buffer.from("reference-on-file-photo");
  const result = await faceMatcher().compare(live.length ? live : Buffer.from(""), reference);
  return NextResponse.json(result);
}