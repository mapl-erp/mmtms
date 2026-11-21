import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { cronAuthorized } from "@/lib/cron";
import { prisma, withTenant } from "@/lib/db";
import { submitClaim } from "@/lib/expenses";
import { ingestFault, ingestTpms, tpmsStatus } from "@/lib/maintenance";
import { faceMatcher } from "@/lib/notify";
import { ingestPing } from "@/lib/pings";
import { pastRetention } from "@/lib/retention";
import { archiveDue } from "@/lib/retention";
import type { Actor } from "@/lib/session";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { applyLeave, decideLeave, recordBreath, scheduleBreathDue } from "@/lib/safety";
import { drivingAlerts, evaluatePing, type TrackerSnapshot } from "@/lib/tracking";
import { payrollFor } from "@/lib/expenses";

const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.MIGRATE_DATABASE_URL });

const settings = { ...DEFAULT_SETTINGS };
const route = [
  { lat: 19.076, lng: 72.878 },
  { lat: 18.52, lng: 73.856 },
];
const zones = [
  { name: "yard" as const, lat: 18.52, lng: 73.856 },
  { name: "loading" as const, lat: 19.076, lng: 72.878 },
];

function ping(over: Partial<Parameters<typeof evaluatePing>[1]> = {}) {
  return {
    regNo: "MH14MM3501",
    lat: 19.076,
    lng: 72.878,
    speedKmh: 50,
    at: new Date("2026-11-21T10:00:00.000Z"),
    route,
    zones,
    ...over,
  };
}

async function wipe(tenantId: string) {
  await admin.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await admin.breathTest.deleteMany({ where: { tenantId } });
    await admin.leaveRequest.deleteMany({ where: { tenantId } });
    await admin.trackerState.deleteMany({ where: { tenantId } });
    await admin.archiveRecord.deleteMany({ where: { tenantId } });
    await admin.alert.deleteMany({ where: { tenantId } });
    await admin.expenseClaim.deleteMany({ where: { tenantId } });
    await admin.attendance.deleteMany({ where: { tenantId } });
    await admin.workshopJob.deleteMany({ where: { tenantId } });
    await admin.tyre.deleteMany({ where: { tenantId } });
    await admin.storedFile.deleteMany({ where: { tenantId } });
    await admin.ledgerEvent.deleteMany({ where: { tenantId } });
    await admin.invoice.deleteMany({ where: { tenantId } });
    await admin.party.deleteMany({ where: { tenantId } });
    await admin.trip.deleteMany({ where: { tenantId } });
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

describe("tracking, safety, claims, and archive", () => {
  it("raises corridor, stop, speed, geofence, and escalated tracker alerts", () => {
    const first = evaluatePing(null, ping({ speedKmh: 90 }), settings);
    expect(first.alerts.map((alert) => alert.rule)).toContain("overspeed");
    expect(first.alerts.find((alert) => alert.rule === "overspeed")?.recipients).toEqual(["MANAGER"]);
    const stoppedAt = new Date("2026-11-21T12:30:00.000Z");
    const previous: TrackerSnapshot = {
      ...first.next,
      stoppedSince: "2026-11-21T10:00:00.000Z",
      stopAlerted: false,
      speedKmh: 0,
    };
    const stopped = evaluatePing(previous, ping({ lat: 19.4, lng: 73.4, speedKmh: 0, at: stoppedAt }), settings);
    expect(stopped.alerts.map((alert) => alert.rule)).toContain("unplanned_stop");
    const off = evaluatePing(null, ping({ lat: 21.5, lng: 75.5, speedKmh: 40 }), settings);
    expect(off.alerts.map((alert) => alert.rule)).toContain("route_deviation");
    const enter = evaluatePing(null, ping(), settings);
    expect(enter.alerts.map((alert) => alert.rule)).toContain("geofence_entry");
    const leave = evaluatePing(enter.next, ping({ lat: 19.4, lng: 73.4 }), settings);
    expect(leave.alerts.map((alert) => alert.rule)).toContain("geofence_exit");
    const tamper = evaluatePing(null, ping({ tamper: true, powerCut: true }), settings);
    expect(tamper.alerts.find((alert) => alert.rule === "tracker_tamper")?.recipients).toEqual(["MANAGER", "OWNER"]);
    expect(tamper.alerts.find((alert) => alert.rule === "power_cut")?.recipients).toEqual(["MANAGER", "OWNER"]);
    const hours = drivingAlerts("MH14MM3501", 6.2, false, false, settings);
    expect(hours.alerts[0]?.rule).toBe("drive_reminder");
    const firm = drivingAlerts("MH14MM3501", 8.1, true, false, settings);
    expect(firm.alerts[0]?.rule).toBe("drive_limit");
  });

  it("writes a tamper alert into the ledger and schedules two breath tests", async () => {
    const tenant = await admin.tenant.create({ data: { slug: `trk-${randomUUID().slice(0, 8)}`, name: "T", settings: DEFAULT_SETTINGS } });
    const driver = await admin.driver.create({
      data: { tenantId: tenant.id, name: "R", phone: "1", dlNumber: "L", dlExpiry: new Date("2027-01-01"), monthlySalary: "31000" },
    });
    const truck = await admin.truck.create({
      data: { tenantId: tenant.id, regNo: "MH14TR0001", make: "Tata", model: "Signa", capacityTons: "35", wheels: 16, status: "in_transit", expectedKmpl: "3" },
    });
    const trip = await admin.trip.create({
      data: {
        tenantId: tenant.id,
        number: "TRP-9",
        status: "IN_TRANSIT",
        truckId: truck.id,
        driverId: driver.id,
        origin: "Mumbai",
        destination: "Pune",
        goods: "coils",
        weightTons: "10",
        rateBasis: "FIXED",
        rate: "1000",
        freight: "1000",
        lrNumber: "MM/26-27/0099",
        startedAt: new Date(Date.now() - 8.5 * 3600 * 1000),
      },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "OWNER", name: "O", driverId: null };
    try {
      const due = scheduleBreathDue(new Date("2026-11-21T00:00:00.000Z"), 2);
      expect(due).toHaveLength(2);
      expect(due[0].getTime()).toBeGreaterThan(new Date("2026-11-21T00:00:00.000Z").getTime());
      await withTenant(tenant.id, async (tx) => {
        await tx.breathTest.create({ data: { tenantId: tenant.id, tripId: trip.id, dueAt: new Date(), status: "pending" } });
        const alerts = await ingestPing(tx, actor, { truckId: truck.id, regNo: truck.regNo, lat: 19.1, lng: 73.2, speedKmh: 88, tamper: true });
        expect(alerts.some((alert) => alert.rule === "tracker_tamper")).toBe(true);
        expect(alerts.some((alert) => alert.rule === "drive_limit")).toBe(true);
        const test = await tx.breathTest.findFirstOrThrow({ where: { tripId: trip.id } });
        const failed = await recordBreath(tx, actor, { testId: test.id, passed: false });
        expect(failed.ok).toBe(true);
      });
      const stored = await withTenant(tenant.id, (tx) => tx.alert.findMany({ where: { tenantId: tenant.id } }));
      expect(stored.some((alert) => alert.rule === "breath_fail" && alert.recipients.includes("MANAGER"))).toBe(true);
      const ledger = await withTenant(tenant.id, (tx) => tx.ledgerEvent.findMany({ where: { tenantId: tenant.id, eventType: "alert.raised" } }));
      expect(ledger.length).toBeGreaterThan(0);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("blocks a claim without a receipt and removes approved leave from pay", async () => {
    const tenant = await admin.tenant.create({ data: { slug: `lv-${randomUUID().slice(0, 8)}`, name: "L", settings: DEFAULT_SETTINGS } });
    const driver = await admin.driver.create({
      data: { tenantId: tenant.id, name: "Suresh", phone: "1", dlNumber: "L", dlExpiry: new Date("2027-01-01"), monthlySalary: "30000" },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: driver.id };
    try {
      const missing = await withTenant(tenant.id, (tx) =>
        submitClaim(tx, actor, { driverId: driver.id, category: "FOOD", amount: 100, claimedOn: "2026-11-21" }),
      );
      expect(missing.ok).toBe(false);
      const leave = await withTenant(tenant.id, (tx) => applyLeave(tx, actor, { driverId: driver.id, startsOn: "2026-11-01", endsOn: "2026-11-02", reason: "Family" }));
      expect(leave.ok).toBe(true);
      if (!leave.ok) return;
      await withTenant(tenant.id, (tx) => decideLeave(tx, actor, leave.data.id, "approved"));
      await withTenant(tenant.id, (tx) =>
        tx.attendance.create({ data: { tenantId: tenant.id, driverId: driver.id, day: new Date("2026-11-03"), status: "ON_DUTY", source: "AUTO" } }),
      );
      const pay = await withTenant(tenant.id, (tx) => payrollFor(tx, tenant.id, driver.id, "2026-11"));
      expect(pay.dutyDays).toBe(1);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("feeds a fault code and a soft tyre into maintenance alerts", async () => {
    expect(tpmsStatus(500, 40, 600, 80)).toMatch(/pressure/);
    const tenant = await admin.tenant.create({ data: { slug: `mnt-${randomUUID().slice(0, 8)}`, name: "M", settings: DEFAULT_SETTINGS } });
    const truck = await admin.truck.create({
      data: { tenantId: tenant.id, regNo: "MH14TP0001", make: "Tata", model: "Signa", capacityTons: "35", wheels: 16, status: "available", expectedKmpl: "3" },
    });
    const tyre = await admin.tyre.create({ data: { tenantId: tenant.id, truckId: truck.id, serial: "TY-1", position: "Steer L", kmRun: 10 } });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "MANAGER", name: "M", driverId: null };
    try {
      const fault = await withTenant(tenant.id, (tx) => ingestFault(tx, actor, { truckId: truck.id, code: "SPN100.FMI1" }));
      expect(fault.ok).toBe(true);
      const reading = await withTenant(tenant.id, (tx) => ingestTpms(tx, actor, { tyreId: tyre.id, pressureKpa: 500, tempC: 40 }));
      expect(reading.ok && reading.data.problem).toMatch(/pressure/);
      const alerts = await withTenant(tenant.id, (tx) => tx.alert.findMany({ where: { tenantId: tenant.id } }));
      expect(alerts.map((alert) => alert.rule).sort()).toEqual(["j1939", "tpms"]);
    } finally {
      await wipe(tenant.id);
    }
  });

  it("seals an old invoice into the archive and keeps the ledger", async () => {
    const tenant = await admin.tenant.create({ data: { slug: `arc-${randomUUID().slice(0, 8)}`, name: "A", settings: DEFAULT_SETTINGS } });
    const party = await admin.party.create({ data: { tenantId: tenant.id, name: "Old", kind: "customer", tags: ["customer"] } });
    const invoice = await admin.invoice.create({
      data: {
        tenantId: tenant.id,
        number: "INV-OLD",
        partyId: party.id,
        taxable: "100",
        gstMode: "EIGHTEEN_ITC",
        gstRate: "18",
        gstAmount: "18",
        total: "118",
        itcEligible: true,
        createdAt: new Date("2018-05-01T00:00:00.000Z"),
      },
    });
    const actor: Actor = { id: randomUUID(), tenantId: tenant.id, role: "OWNER", name: "O", driverId: null };
    try {
      expect(pastRetention(invoice.createdAt, new Date("2026-11-21T00:00:00.000Z"), 6)).toBe(true);
      const result = await withTenant(tenant.id, (tx) => archiveDue(tx, actor, new Date("2026-11-21T00:00:00.000Z")));
      expect(result.sealed).toBe(1);
      const archived = await admin.archiveRecord.findFirst({ where: { sourceId: invoice.id } });
      expect(archived?.sealedHash).toHaveLength(64);
      const stillThere = await admin.invoice.findUnique({ where: { id: invoice.id } });
      expect(stillThere?.number).toBe("INV-OLD");
      const ledger = await admin.ledgerEvent.findFirst({ where: { tenantId: tenant.id, eventType: "archive.sealed" } });
      expect(ledger).toBeTruthy();
    } finally {
      await wipe(tenant.id);
    }
  });

  it("matches a face in the simulator and refuses a cron call without the secret", async () => {
    const matcher = faceMatcher();
    const photo = Buffer.from("driver-face-photo-bytes");
    expect((await matcher.compare(photo, photo)).match).toBe(true);
    expect((await matcher.compare(Buffer.from("FAILxxxx"), photo)).match).toBe(false);
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    expect(cronAuthorized(new Request("http://localhost/api/cron/daily"))).toBe(false);
    expect(cronAuthorized(new Request("http://localhost/api/cron/daily", { headers: { authorization: "Bearer test-secret" } }))).toBe(true);
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });
});
