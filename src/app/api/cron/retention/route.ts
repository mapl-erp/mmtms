import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { prisma, withTenant } from "@/lib/db";
import { archiveDue } from "@/lib/retention";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let sealed = 0;
  for (const tenant of tenants) {
    const actor = { id: tenant.id, tenantId: tenant.id, role: "OWNER", name: "Scheduler", driverId: null };
    const result = await withTenant(tenant.id, (tx) => archiveDue(tx, actor));
    sealed += result.sealed;
  }
  return NextResponse.json({ ok: true, sealed });
}
