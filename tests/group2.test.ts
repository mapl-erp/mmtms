import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import { ewayWarning, financialYear, recordDeliveryFacts, recordSettlement, roundTripProfit } from "@/lib/lifecycle";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { addProof, advanceTrip, createTrip, setSeal } from "@/lib/trips";

const admin = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL });

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await admin.breathTest.deleteMany({ where: { tenantId } });
    await admin.trackerState.deleteMany({ where: { tenantId } });
    await admin.documentOverride.deleteMany({ where: { tenantId } });
    await admin.expenseClaim.deleteMany({ where: { tenantId } });
    await admin.settlement.deleteMany({ where: { tenantId } });
    await admin.tripStop.deleteMany({ where: { tenantId } });
    await admin.alert.deleteMany({ where: { tenantId } });
    await admin.booking.deleteMany({ where: { tenantId } });
    await admin.seriesCounter.deleteMany({ where: { tenantId } });
    await admin.proof.deleteMany({ where: { tenantId } });
    await admin.fuelFill.deleteMany({ where: { tenantId } });
    await admin.invoice.deleteMany({ where: { tenantId } });
    await admin.assignment.deleteMany({ where: { tenantId } });
    await admin.trip.deleteMany({ where: { tenantId } });
    await admin.storedFile.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
    await admin.driver.deleteMany({ where: { tenantId } });
    await admin.truck.deleteMany({ where: { tenantId } });
    await admin.party.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  } finally {
    await admin.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);
  }
}

afterAll(async () => {
  await prisma.$disconnect();
  await admin.$disconnect();
});

describe("trip lifecycle", () => {
  it("numbers each stop in the financial year and resets per tenant", async () => {
    const slug = `fy-${randomUUID().slice(0, 8)}`;
    const tenant = await admin.tenant.create({ data: { slug, name: slug, settings: DEFAULT_SETTINGS } });
    const driver = await admin.driver.create({
      data: { tenantId: tenant.id, name: "D", phone: "1", dlNumber: "L", dlExpiry: new Date("2027-01-01") },
    });
    const truck = await admin.truck.create({
      data: {
        tenantId: tenant.id,
        regNo: "MH14FY0001",
        make: "Tata",
        model: "Signa",
        capacityTons: "35",
        wheels: 16,
        status: "available",
        expectedKmpl: "3",
      },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "OWNER", name: "O", driverId: null };
    try {
      const fy = financialYear();
      const multi = await withTenant(tenant.id, (tx) =>
        createTrip(tx, actor, {
          truckId: truck.id,
          driverId: driver.id,
          origin: "Pune",
          destination: "Nashik",
          goods: "parts",
          weightTons: 10,
          rateBasis: "FIXED",
          rate: 5000,
          stops: [
            { kind: "PICKUP", place: "Pune" },
            { kind: "DROP", place: "Nashik" },
          ],
        }),
      );
      expect(multi.ok).toBe(true);
      if (!multi.ok) return;
      const stops = await withTenant(tenant.id, (tx) => tx.tripStop.findMany({ where: { tripId: multi.data.id }, orderBy: { seq: "asc" } }));
      expect(stops.map((stop) => stop.lrNumber)).toEqual([`MM/${fy}/0001`, `MM/${fy}/0002`]);
      const second = await withTenant(tenant.id, (tx) =>
        createTrip(tx, actor, {
          truckId: truck.id,
          driverId: driver.id,
          origin: "Mumbai",
          destination: "Pune",
          goods: "coils",
          weightTons: 8,
          rateBasis: "FIXED",
          rate: 4000,
        }),
      );
      expect(second.ok && second.data.lrNumber).toBe(`MM/${fy}/0003`);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("refuses to close without a settlement and alerts on a seal mismatch", async () => {
    const slug = `close-${randomUUID().slice(0, 8)}`;
    const tenant = await admin.tenant.create({ data: { slug, name: slug, settings: DEFAULT_SETTINGS } });
    const driver = await admin.driver.create({
      data: { tenantId: tenant.id, name: "D", phone: "1", dlNumber: "L", dlExpiry: new Date("2027-01-01") },
    });
    const truck = await admin.truck.create({
      data: {
        tenantId: tenant.id,
        regNo: "MH14CL0001",
        make: "Tata",
        model: "Signa",
        capacityTons: "35",
        wheels: 16,
        status: "available",
        expectedKmpl: "3",
      },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: null };
    try {
      const created = await withTenant(tenant.id, (tx) =>
        createTrip(tx, actor, {
          truckId: truck.id,
          driverId: driver.id,
          origin: "Pune",
          destination: "Nashik",
          goods: "machinery",
          weightTons: 12,
          rateBasis: "FIXED",
          rate: 10000,
          ewayBillNo: "311000000001",
          ewayValidUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        }),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, created.data.id));
      await withTenant(tenant.id, async (tx) => {
        await setSeal(tx, actor, created.data.id, "SL-900");
        for (const kind of ["LOAD_PHOTO", "SEAL_PHOTO", "WEIGHBRIDGE_LOAD", "CONSIGNOR_SIGNATURE"]) {
          await addProof(tx, actor, {
            tripId: created.data.id,
            kind,
            bytes: Buffer.from(kind),
            mime: "image/png",
            capture: "camera",
          });
        }
      });
      await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, created.data.id));
      const trip = await withTenant(tenant.id, (tx) => tx.trip.findUniqueOrThrow({ where: { id: created.data.id } }));
      expect(ewayWarning(trip, { ewayWarnHours: 8 })).toMatch(/expires/);
      await withTenant(tenant.id, async (tx) => {
        await tx.trip.update({ where: { id: trip.id }, data: { podOtpOk: true } });
        for (const kind of ["SEAL_INTACT", "UNLOAD_PHOTO", "WEIGHBRIDGE_UNLOAD", "SIGNATURE"]) {
          await addProof(tx, actor, {
            tripId: trip.id,
            kind,
            bytes: Buffer.from(kind),
            mime: "image/png",
            capture: "camera",
          });
        }
      });
      await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, trip.id));
      const blocked = await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, trip.id));
      expect(blocked.ok).toBe(false);
      await withTenant(tenant.id, (tx) => recordSettlement(tx, actor, trip.id, 500, "cleared"));
      const closed = await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, trip.id));
      expect(closed.ok).toBe(true);
      await withTenant(tenant.id, (tx) => recordDeliveryFacts(tx, actor, trip.id, { podSeal: "SL-DIFFERENT", loadWeightKg: 12000, unloadWeightKg: 11000 }));
      const alerts = await withTenant(tenant.id, (tx) => tx.alert.findMany({ where: { tenantId: tenant.id } }));
      expect(alerts.some((alert) => alert.rule === "seal_mismatch")).toBe(true);
      expect(alerts.some((alert) => alert.rule === "weight_shortage")).toBe(true);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("nets a round trip", () => {
    expect(roundTripProfit({ freights: [90000, 40000], fuel: [18000], expenses: [2500], commission: 4000 })).toBe(105500);
  });
});
