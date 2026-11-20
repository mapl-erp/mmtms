import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import { storeBytes } from "@/lib/files";
import { appendLedger, chainHash } from "@/lib/ledger";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { financialYear } from "@/lib/lifecycle";
import { addProof, advanceTrip, createTrip, setSeal } from "@/lib/trips";
import { uploadPath, verifyTenant } from "@/lib/verify";

const admin = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL });

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
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

async function desk(slug: string) {
  const tenant = await admin.tenant.create({
    data: { slug, name: slug, settings: DEFAULT_SETTINGS },
  });
  const driver = await admin.driver.create({
    data: {
      tenantId: tenant.id,
      name: "Test Driver",
      phone: "9000000000",
      dlNumber: `DL-${slug}`,
      dlExpiry: new Date("2027-01-01"),
      monthlySalary: "20000",
    },
  });
  const truck = await admin.truck.create({
    data: {
      tenantId: tenant.id,
      regNo: `MH14${slug.slice(0, 6).toUpperCase()}`,
      make: "Tata",
      model: "Signa",
      capacityTons: "35",
      wheels: 16,
      status: "available",
      expectedKmpl: "3.2",
    },
  });
  const user = await admin.user.create({
    data: {
      tenantId: tenant.id,
      email: `${slug}@test.example`,
      passwordHash: "x",
      name: "Manager",
      role: "MANAGER",
    },
  });
  const actor: Actor = { id: user.id, tenantId: tenant.id, role: "MANAGER", name: "Manager", driverId: null };
  return { tenant, driver, truck, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  await admin.$disconnect();
});

describe("phase 1 ledger, tenancy, and trips", () => {
  it("hashes the previous hash, the canonical payload, and the file hashes", () => {
    const left = chainHash("abc", { b: 1, a: { d: true, c: "x" } }, ["h2", "h1"]);
    const right = chainHash("abc", { a: { c: "x", d: true }, b: 1 }, ["h1", "h2"]);
    expect(left).toBe(right);
    expect(left).toHaveLength(64);
    expect(chainHash("abd", { b: 1, a: { d: true, c: "x" } }, ["h2", "h1"])).not.toBe(left);
    expect(chainHash("abc", { b: 2, a: { d: true, c: "x" } }, ["h2", "h1"])).not.toBe(left);
    expect(chainHash("abc", { b: 1, a: { d: true, c: "x" } }, ["h3"])).not.toBe(left);
  });

  it("verifies an appended chain", async () => {
    const slug = `chain-${randomUUID().slice(0, 8)}`;
    const { tenant, actor } = await desk(slug);
    try {
      await withTenant(tenant.id, async (tx) => {
        await appendLedger(tx, {
          tenantId: tenant.id,
          eventType: "demo.one",
          entityType: "tenant",
          entityId: tenant.id,
          actorId: actor.id,
          payload: { step: "one" },
        });
        await appendLedger(tx, {
          tenantId: tenant.id,
          eventType: "demo.two",
          entityType: "tenant",
          entityId: tenant.id,
          actorId: actor.id,
          payload: { step: "two" },
          fileHashes: [],
        });
      });
      const result = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("rejects ledger updates and catches a real tamper before restoring it", async () => {
    const slug = `tamper-${randomUUID().slice(0, 8)}`;
    const { tenant, actor } = await desk(slug);
    try {
      const event = await withTenant(tenant.id, (tx) =>
        appendLedger(tx, {
          tenantId: tenant.id,
          eventType: "demo.kept",
          entityType: "tenant",
          entityId: tenant.id,
          actorId: actor.id,
          payload: { kept: true },
        }),
      );
      await expect(
        withTenant(tenant.id, (tx) => tx.ledgerEvent.update({ where: { id: event.id }, data: { hash: "nope" } })),
      ).rejects.toThrow(/append-only|permission denied/i);
      await expect(admin.ledgerEvent.update({ where: { id: event.id }, data: { hash: "nope" } })).rejects.toThrow(
        /append-only/i,
      );

      await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
      await admin.$executeRawUnsafe(
        `UPDATE ledger_events SET payload = $1::jsonb WHERE id = $2::uuid`,
        JSON.stringify({ kept: false, tampered: true }),
        event.id,
      );
      await admin.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);

      const broken = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(broken.ok).toBe(false);
      expect(broken.breaks.some((item) => item.reason.includes("hash does not match"))).toBe(true);

      await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
      await admin.$executeRawUnsafe(
        `UPDATE ledger_events SET payload = $1::jsonb WHERE id = $2::uuid`,
        JSON.stringify({ kept: true }),
        event.id,
      );
      await admin.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);
      const restored = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(restored.ok).toBe(true);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("catches a changed media file and passes again after the bytes are restored", async () => {
    const slug = `media-${randomUUID().slice(0, 8)}`;
    const { tenant, actor } = await desk(slug);
    try {
      const stored = await withTenant(tenant.id, async (tx) => {
        const file = await storeBytes(tx, tenant.id, Buffer.from("seal-photo-v1"), "image/png", "seal");
        await appendLedger(tx, {
          tenantId: tenant.id,
          eventType: "proof.added",
          entityType: "proof",
          entityId: file.id,
          actorId: actor.id,
          payload: { label: "seal" },
          fileHashes: [file.sha256],
        });
        return file;
      });
      const absolute = uploadPath(stored.path);
      const original = await readFile(absolute);
      await writeFile(absolute, Buffer.concat([original, Buffer.from("tamper")]));
      const broken = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(broken.ok).toBe(false);
      expect(broken.breaks.some((item) => item.reason.includes("media hash"))).toBe(true);
      await writeFile(absolute, original);
      const restored = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(restored.ok).toBe(true);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("hides other tenants and blocks a cross-tenant insert", async () => {
    const a = await desk(`rls-a-${randomUUID().slice(0, 8)}`);
    const b = await desk(`rls-b-${randomUUID().slice(0, 8)}`);
    try {
      await withTenant(a.tenant.id, (tx) =>
        tx.trip.create({
          data: {
            tenantId: a.tenant.id,
            number: "TRP-1",
            status: "PLANNED",
            truckId: a.truck.id,
            driverId: a.driver.id,
            origin: "Pune",
            destination: "Nashik",
            goods: "coils",
            weightTons: "10",
            rateBasis: "FIXED",
            rate: "1000",
            freight: "1000",
            lrNumber: "MM-0001",
          },
        }),
      );
      await withTenant(b.tenant.id, (tx) =>
        tx.trip.create({
          data: {
            tenantId: b.tenant.id,
            number: "TRP-1",
            status: "PLANNED",
            truckId: b.truck.id,
            driverId: b.driver.id,
            origin: "Mumbai",
            destination: "Pune",
            goods: "wire",
            weightTons: "10",
            rateBasis: "FIXED",
            rate: "1000",
            freight: "1000",
            lrNumber: "MM-0001",
          },
        }),
      );
      const seen = await withTenant(a.tenant.id, (tx) => tx.trip.findMany());
      expect(seen).toHaveLength(1);
      expect(seen[0]?.origin).toBe("Pune");
      const crossed = await withTenant(a.tenant.id, (tx) => tx.trip.findMany({ where: { tenantId: b.tenant.id } }));
      expect(crossed).toHaveLength(0);
      await expect(
        withTenant(a.tenant.id, (tx) =>
          tx.trip.create({
            data: {
              tenantId: b.tenant.id,
              number: "TRP-9",
              status: "PLANNED",
              truckId: a.truck.id,
              driverId: a.driver.id,
              origin: "X",
              destination: "Y",
              goods: "nope",
              weightTons: "1",
              rateBasis: "FIXED",
              rate: "1",
              freight: "1",
              lrNumber: "MM-0009",
            },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await wipe(a.tenant.id);
      await wipe(b.tenant.id);
    }
  });

  it("walks a trip from planned to in transit only after proof of loading", async () => {
    const slug = `life-${randomUUID().slice(0, 8)}`;
    const { tenant, driver, truck, actor } = await desk(slug);
    try {
      const created = await withTenant(tenant.id, (tx) =>
        createTrip(tx, actor, {
          truckId: truck.id,
          driverId: driver.id,
          origin: "Pune",
          destination: "Nashik",
          goods: "machinery",
          weightTons: 28,
          rateBasis: "FIXED",
          rate: 76000,
        }),
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.lrNumber).toBe(`MM/${financialYear()}/0001`);
      const loading = await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, created.data.id));
      expect(loading.ok).toBe(true);
      const blocked = await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, created.data.id));
      expect(blocked.ok).toBe(false);
      await withTenant(tenant.id, async (tx) => {
        const sealed = await setSeal(tx, actor, created.data.id, "SL-100");
        expect(sealed.ok).toBe(true);
        for (const kind of ["LOAD_PHOTO", "WEIGHBRIDGE_LOAD", "SEAL_PHOTO", "CONSIGNOR_SIGNATURE"]) {
          const proof = await addProof(tx, actor, {
            tripId: created.data.id,
            kind,
            bytes: Buffer.from(`proof-${kind}`),
            mime: "image/png",
            capture: "camera",
          });
          expect(proof.ok).toBe(true);
        }
      });
      const rolling = await withTenant(tenant.id, (tx) => advanceTrip(tx, actor, created.data.id));
      expect(rolling.ok).toBe(true);
      if (rolling.ok) expect(rolling.data.status).toBe("IN_TRANSIT");
      const chain = await withTenant(tenant.id, (tx) => verifyTenant(tx, tenant.id));
      expect(chain.ok).toBe(true);
      const types = chain.events.map((event) => event.eventType);
      expect(types).toContain("trip.created");
      expect(types).toContain("trip.seal_set");
      expect(types).toContain("proof.added");
      expect(types).toContain("trip.status");
    } finally {
      await wipe(tenant.id);
    }
  });

  it("issues MM-0001 again for a different tenant", async () => {
    const first = await desk(`lr-a-${randomUUID().slice(0, 8)}`);
    const second = await desk(`lr-b-${randomUUID().slice(0, 8)}`);
    try {
      const a = await withTenant(first.tenant.id, (tx) =>
        createTrip(tx, first.actor, {
          truckId: first.truck.id,
          driverId: first.driver.id,
          origin: "Mumbai",
          destination: "Pune",
          goods: "coils",
          weightTons: 30,
          rateBasis: "PER_TONNE",
          rate: 2800,
        }),
      );
      const b = await withTenant(second.tenant.id, (tx) =>
        createTrip(tx, second.actor, {
          truckId: second.truck.id,
          driverId: second.driver.id,
          origin: "Pune",
          destination: "Nashik",
          goods: "wire",
          weightTons: 12,
          rateBasis: "PER_KM",
          rate: 40,
          distanceKm: 210,
        }),
      );
      expect(a.ok && a.data.lrNumber).toBe(`MM/${financialYear()}/0001`);
      expect(b.ok && b.data.lrNumber).toBe(`MM/${financialYear()}/0001`);
      expect(a.ok && b.ok && a.data.tenantId).not.toBe(b.data.tenantId);
    } finally {
      await wipe(first.tenant.id);
      await wipe(second.tenant.id);
    }
  });
});
