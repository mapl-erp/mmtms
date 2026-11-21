import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { can } from "@/lib/access";
import { decryptField, encryptField } from "@/lib/crypto";
import { prisma, withTenant } from "@/lib/db";
import { decideFuel, recordFuel } from "@/lib/fuel";
import { presentDriver, saveDriverProfile } from "@/lib/people";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { createTrip } from "@/lib/trips";
import { verifyTenant } from "@/lib/verify";

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
    await admin.quote.deleteMany({ where: { tenantId } });
    await admin.truckDocument.deleteMany({ where: { tenantId } });
    await admin.workshopJob.deleteMany({ where: { tenantId } });
    await admin.tyre.deleteMany({ where: { tenantId } });
    await admin.trip.deleteMany({ where: { tenantId } });
    await admin.storedFile.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
    await admin.driver.deleteMany({ where: { tenantId } });
    await admin.truck.deleteMany({ where: { tenantId } });
    await admin.branch.deleteMany({ where: { tenantId } });
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

describe("roles, encrypted KYC, and owner override", () => {
  it("round-trips encrypted fields and masks them for a manager", async () => {
    const cipher = encryptField("2341 5678 9012");
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(decryptField(cipher)).toBe("2341 5678 9012");
    const slug = `kyc-${randomUUID().slice(0, 8)}`;
    const tenant = await admin.tenant.create({ data: { slug, name: slug, settings: DEFAULT_SETTINGS } });
    try {
      const driver = await admin.driver.create({
        data: {
          tenantId: tenant.id,
          name: "Ramesh",
          phone: "9000000001",
          dlNumber: "DL",
          dlExpiry: new Date("2027-01-01"),
        },
      });
      const owner: Actor = {
        id: randomUUID(),
        tenantId: tenant.id,
        role: "OWNER",
        name: "Owner",
        driverId: null,
      };
      await admin.user.create({
        data: { id: owner.id, tenantId: tenant.id, email: `${slug}@t`, passwordHash: "x", name: "Owner", role: "OWNER" },
      });
      await withTenant(tenant.id, (tx) =>
        saveDriverProfile(tx, owner, { driverId: driver.id, aadhaar: "2341 5678 9012", pan: "ABCPR1234R", bankAccount: "501002220011" }),
      );
      const stored = await admin.driver.findUniqueOrThrow({ where: { id: driver.id } });
      expect(stored.aadhaarEnc).not.toContain("2341");
      expect(stored.aadhaarLast4).toBe("9012");
      const manager: Actor = { ...owner, role: "MANAGER" };
      const accountant: Actor = { ...owner, role: "ACCOUNTANT" };
      expect(presentDriver(manager, stored).aadhaar).toBe("•••• 9012");
      expect(presentDriver(accountant, stored).aadhaar).toBe("2341 5678 9012");
      expect(presentDriver(owner, stored).pan).toBe("ABCPR1234R");
    } finally {
      await wipe(tenant.id);
    }
  });

  it("blocks a trip on an expired document unless the owner logs a reason", async () => {
    const slug = `ovr-${randomUUID().slice(0, 8)}`;
    const tenant = await admin.tenant.create({ data: { slug, name: slug, settings: DEFAULT_SETTINGS } });
    try {
      const driver = await admin.driver.create({
        data: { tenantId: tenant.id, name: "Suresh", phone: "9000000002", dlNumber: "DL2", dlExpiry: new Date("2027-01-01") },
      });
      const truck = await admin.truck.create({
        data: {
          tenantId: tenant.id,
          regNo: "MH14OVR001",
          make: "Tata",
          model: "Signa",
          capacityTons: "35",
          wheels: 16,
          status: "available",
          expectedKmpl: "3",
        },
      });
      await admin.truckDocument.create({
        data: {
          tenantId: tenant.id,
          truckId: truck.id,
          docType: "PUC",
          docNumber: "OLD",
          expiresOn: new Date("2020-01-01"),
        },
      });
      const manager: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: null };
      const owner: Actor = { ...manager, id: randomUUID(), role: "OWNER", name: "O" };
      const input = {
        truckId: truck.id,
        driverId: driver.id,
        origin: "Pune",
        destination: "Nashik",
        goods: "coils",
        weightTons: 10,
        rateBasis: "FIXED" as const,
        rate: 1000,
      };
      const blocked = await withTenant(tenant.id, (tx) => createTrip(tx, manager, { ...input, overrideReason: "please let this go" }));
      expect(blocked.ok).toBe(false);
      const missing = await withTenant(tenant.id, (tx) => createTrip(tx, owner, input));
      expect(missing.ok).toBe(false);
      const allowed = await withTenant(tenant.id, (tx) =>
        createTrip(tx, owner, { ...input, overrideReason: "Permit renewal is with the RTO today" }),
      );
      expect(allowed.ok).toBe(true);
      const chain = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(chain.ok).toBe(true);
      expect(chain.events.some((event) => event.eventType === "document.override")).toBe(true);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("lets the owner revoke fuel approval from a manager", async () => {
    expect(can({ role: "MANAGER", permissionOverrides: { revoke: ["fuel.approve"] } }, "fuel.approve")).toBe(false);
    expect(can({ role: "MANAGER" }, "fuel.approve")).toBe(true);
    expect(can({ role: "ACCOUNTANT" }, "drivers.kyc")).toBe(true);
    expect(can({ role: "MANAGER" }, "drivers.kyc")).toBe(false);
    const slug = `perm-${randomUUID().slice(0, 8)}`;
    const tenant = await admin.tenant.create({ data: { slug, name: slug, settings: DEFAULT_SETTINGS } });
    try {
      const truck = await admin.truck.create({
        data: {
          tenantId: tenant.id,
          regNo: "MH14PERM01",
          make: "Tata",
          model: "Signa",
          capacityTons: "35",
          wheels: 16,
          status: "available",
          expectedKmpl: "3",
        },
      });
      const actor: Actor = {
        id: randomUUID(),
        tenantId: tenant.id,
        role: "MANAGER",
        name: "M",
        driverId: null,
        permissionOverrides: { revoke: ["fuel.approve"] },
      };
      const fill = await withTenant(tenant.id, (tx) =>
        recordFuel(tx, { ...actor, permissionOverrides: {} }, {
          truckId: truck.id,
          litres: 100,
          amount: 9000,
          odometer: 10,
          station: "IOCL",
          method: "FLEET_CARD",
        }),
      );
      expect(fill.ok).toBe(true);
      if (!fill.ok) return;
      const decision = await withTenant(tenant.id, (tx) => decideFuel(tx, actor, fill.data.id, "approved"));
      expect(decision.ok).toBe(false);
    } finally {
      await wipe(tenant.id);
    }
  });
});
