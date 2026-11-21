import { NextResponse } from "next/server";
import { sendDailySummary } from "@/lib/accounts";
import { cronAuthorized } from "@/lib/cron";
import { prisma, withTenant } from "@/lib/db";
import { raiseAlert } from "@/lib/lifecycle";
import { documentAlert, daysUntil, parseSettings } from "@/lib/settings";
import { sweepSignal } from "@/lib/pings";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let summaries = 0;
  let renewals = 0;
  for (const tenant of tenants) {
    const actor = { id: tenant.id, tenantId: tenant.id, role: "OWNER", name: "Scheduler", driverId: null, permissionOverrides: {} };
    await withTenant(tenant.id, async (tx) => {
      await sendDailySummary(tx, actor);
      summaries += 1;
      await sweepSignal(tx, actor);
      const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).settings);
      const docs = await tx.truckDocument.findMany({ where: { tenantId: tenant.id }, include: { truck: true } });
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      for (const doc of docs) {
        const level = documentAlert(daysUntil(doc.expiresOn), settings.docAlertDays);
        if (!level) continue;
        const already = await tx.alert.findFirst({
          where: { tenantId: tenant.id, entityId: doc.id, rule: "document_renewal", createdAt: { gte: startOfDay } },
        });
        if (already) continue;
        await raiseAlert(tx, actor, {
          rule: "document_renewal",
          severity: level === "expired" ? "high" : "medium",
          message: `${doc.truck.regNo} ${doc.docType} ${level === "expired" ? "has expired" : "is due for renewal"}`,
          entityType: "truck_document",
          entityId: doc.id,
          recipients: ["OWNER", "MANAGER", "ACCOUNTANT"],
        });
        renewals += 1;
      }
    });
  }
  return NextResponse.json({ ok: true, summaries, renewals });
}
