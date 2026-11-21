import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { readSession } from "@/lib/session";
import { storageGet } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id } = await context.params;
  const file = await withTenant(session.tid, (tx) =>
    tx.storedFile.findFirst({ where: { id, tenantId: session.tid } }),
  );
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await storageGet(file.path);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": file.mime, "cache-control": "private, max-age=3600" },
  });
}
