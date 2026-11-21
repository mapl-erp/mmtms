import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import { elockBlock, immobilise, immobiliseBlock, ignitionOutsideDuty, unlockElock } from "@/lib/devices";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { verifyTenant } from "@/lib/verify";

const admin = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL });

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await admin.deviceLog.deleteMany({ where: { tenantId } });
    await admin.alert.deleteMany({ where: { tenantId } });
    await admin.device.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
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

describe("device adapters", () => {
  it("cuts the engine only when the truck is slow, and opens the e-lock only at the drop", async () => {
    expect(immobiliseBlock(48, 5)).toMatch(/slow or stopped/);
    expect(immobiliseBlock(0, 5)).toBeNull();
    expect(elockBlock({ otp: "1", expected: "1", distanceM: 900, radiusM: 500 })).toMatch(/geofence/);
    expect(elockBlock({ otp: "1", expected: "2", distanceM: 10, radiusM: 500 })).toMatch(/OTP/);
    expect(elockBlock({ otp: "446688", expected: "446688", distanceM: 120, radiusM: 500 })).toBeNull();
    expect(ignitionOutsideDuty({ hour: 23, activeTrip: true, start: 5, end: 22 })).toBe(true);
    expect(ignitionOutsideDuty({ hour: 10, activeTrip: false, start: 5, end: 22 })).toBe(true);
    expect(ignitionOutsideDuty({ hour: 10, activeTrip: true, start: 5, end: 22 })).toBe(false);

    const tenant = await admin.tenant.create({ data: { slug: `dev-${randomUUID().slice(0, 8)}`, name: "Dev", settings: DEFAULT_SETTINGS } });
    const truck = await admin.truck.create({
      data: { tenantId: tenant.id, regNo: "MH14DV0001", make: "Tata", model: "Signa", capacityTons: "35", wheels: 16, status: "available", expectedKmpl: "3" },
    });
    const immobiliser = await admin.device.create({
      data: { tenantId: tenant.id, truckId: truck.id, kind: "IMMOBILISER", serial: "IM-1", vendor: "Accolade", firmware: "1" },
    });
    const elock = await admin.device.create({
      data: { tenantId: tenant.id, truckId: truck.id, kind: "ELOCK", serial: "EL-1", vendor: "Sensorise", firmware: "1", config: { otp: "446688" } },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "OWNER", name: "Brij", driverId: null };
    try {
      const moving = await withTenant(tenant.id, (tx) => immobilise(tx, actor, { deviceId: immobiliser.id, reason: "Theft reported by the yard", speedKmh: 42 }));
      expect(moving.ok).toBe(false);
      const stopped = await withTenant(tenant.id, (tx) => immobilise(tx, actor, { deviceId: immobiliser.id, reason: "Theft reported by the yard", speedKmh: 0 }));
      expect(stopped.ok).toBe(true);
      const far = await withTenant(tenant.id, (tx) =>
        unlockElock(tx, actor, { deviceId: elock.id, otp: "446688", lat: 18.52, lng: 73.85, dropLat: 19.997, dropLng: 73.789 }),
      );
      expect(far.ok).toBe(false);
      const near = await withTenant(tenant.id, (tx) =>
        unlockElock(tx, actor, { deviceId: elock.id, otp: "446688", lat: 19.997, lng: 73.79, dropLat: 19.997, dropLng: 73.789 }),
      );
      expect(near.ok).toBe(true);
      const chain = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(chain.ok).toBe(true);
      expect(chain.events.some((event) => event.eventType === "device.immobilise")).toBe(true);
    } finally {
      await wipe(tenant.id);
    }
  });
});
