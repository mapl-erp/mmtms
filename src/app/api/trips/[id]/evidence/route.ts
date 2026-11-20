import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { evidenceZip } from "@/lib/evidence";
import { readSession } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await context.params;
  const zip = await withTenant(session.tid, (tx) => evidenceZip(tx, session.tid, id));
  if (!zip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(zip.bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zip.name}"`,
    },
  });
}
