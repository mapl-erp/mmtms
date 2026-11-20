import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import { decideClaim, payrollFor, submitClaim, theftNotes } from "@/lib/expenses";
import { recordFuel } from "@/lib/fuel";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const admin = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL });

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await admin.expenseClaim.deleteMany({ where: { tenantId } });
    await admin.attendance.deleteMany({ where: { tenantId } });
    await admin.payrollAdjustment.deleteMany({ where: { tenantId } });
    await admin.alertRule.deleteMany({ where: { tenantId } });
    await admin.fuelFill.deleteMany({ where: { tenantId } });
    await admin.seriesCounter.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.driver.deleteMany({ where: { tenantId } });
    await admin.truck.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  } finally {
    await admin.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);
  }
}

afterAll(async () => {
  await prisma.$disconnect();
  await admin.$disconnect();
});

describe("claims, payroll, and fuel theft", () => {
  it("caps food, holds a large claim for the owner, and adds the approved claim to pay", async () => {
    const tenant = await admin.tenant.create({
      data: { slug: `pay-${randomUUID().slice(0, 8)}`, name: "Pay", settings: { ...DEFAULT_SETTINGS, foodDailyCapInr: 400, ownerApprovalAboveInr: 5000 } },
    });
    const driver = await admin.driver.create({
      data: { tenantId: tenant.id, name: "Ramesh", phone: "1", dlNumber: "L", dlExpiry: new Date("2027-01-01"), monthlySalary: "30000" },
    });
    const manager: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: null };
    const owner: Actor = { ...manager, role: "OWNER", name: "O" };
    try {
      const food = await withTenant(tenant.id, (tx) =>
        submitClaim(tx, manager, { driverId: driver.id, category: "FOOD", amount: 700, claimedOn: "2026-11-20", note: "dhaba" }),
      );
      expect(food.ok && Number(food.data.payable)).toBe(400);
      const repair = await withTenant(tenant.id, (tx) =>
        submitClaim(tx, manager, { driverId: driver.id, category: "REPAIR", amount: 8000, claimedOn: "2026-11-20", note: "puncture" }),
      );
      expect(repair.ok && repair.data.status).toBe("pending_owner");
      if (!repair.ok) return;
      const blocked = await withTenant(tenant.id, (tx) => decideClaim(tx, manager, repair.data.id, "approved"));
      expect(blocked.ok).toBe(false);
      const approved = await withTenant(tenant.id, (tx) => decideClaim(tx, owner, repair.data.id, "approved"));
      expect(approved.ok).toBe(true);
      const small = await withTenant(tenant.id, (tx) =>
        submitClaim(tx, manager, { driverId: driver.id, category: "TOLL", amount: 200, claimedOn: "2026-11-20" }),
      );
      if (!small.ok) return;
      await withTenant(tenant.id, (tx) => decideClaim(tx, manager, small.data.id, "approved"));
      const pay = await withTenant(tenant.id, (tx) => payrollFor(tx, tenant.id, driver.id, "2026-11"));
      expect(pay.claims).toBe(8200);
      expect(pay.net).toBe(pay.salary + 8200);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("flags a fill that does not match the tank and a drop while parked", async () => {
    expect(theftNotes({ litres: 80, tankBefore: 100, tankAfter: 120, dropLimit: 15 }).length).toBeGreaterThan(0);
    expect(theftNotes({ litres: 20, tankBefore: 100, tankAfter: 120, parkedDropLitres: 30, dropLimit: 15 })).toEqual([
      "tank fell 30.0 L while parked",
    ]);
    const tenant = await admin.tenant.create({
      data: { slug: `fuel-${randomUUID().slice(0, 8)}`, name: "Fuel", settings: DEFAULT_SETTINGS },
    });
    const truck = await admin.truck.create({
      data: {
        tenantId: tenant.id,
        regNo: "MH14FU0001",
        make: "Tata",
        model: "Signa",
        capacityTons: "35",
        wheels: 16,
        status: "available",
        expectedKmpl: "3.2",
      },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: null };
    try {
      const fill = await withTenant(tenant.id, (tx) =>
        recordFuel(tx, actor, {
          truckId: truck.id,
          litres: 80,
          amount: 7200,
          odometer: 1000,
          station: "IOCL",
          method: "FLEET_CARD",
          tankBefore: 200,
          tankAfter: 220,
          parkedDropLitres: 25,
        }),
      );
      expect(fill.ok && fill.data.flagged).toBe(true);
      expect(fill.ok && fill.data.theftNote).toMatch(/tank rise|parked/);
      const away = await withTenant(tenant.id, (tx) =>
        recordFuel(tx, { ...actor, role: "DRIVER" }, {
          truckId: truck.id,
          litres: 10,
          amount: 900,
          odometer: 1100,
          station: "IOCL",
          method: "FLEET_CARD",
          driverLat: 18.52,
          driverLng: 73.85,
          pumpLat: 19.07,
          pumpLng: 72.87,
        }),
      );
      expect(away.ok).toBe(false);
    } finally {
      await wipe(tenant.id);
    }
  });
});
