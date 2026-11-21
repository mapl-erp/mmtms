import { PrismaClient } from "@prisma/client";
import { encryptField, last4 } from "../src/lib/crypto";
import { labeledSvg } from "../src/lib/files";
import { appendLedger } from "../src/lib/ledger";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import type { Actor } from "../src/lib/session";
import { recordSettlement } from "../src/lib/lifecycle";
import { addProof, advanceTrip, createTrip, setSeal, verifyPodOtp } from "../src/lib/trips";
import { decideFuel, recordFuel } from "../src/lib/fuel";
import { createInvoice } from "../src/lib/billing";
import { registerDocument } from "../src/lib/fleet";
import { prisma } from "../src/lib/db";

/**
 * Demo sign-in for workspace mighty-movers.
 * These passwords are the local demo only.
 */
export const DEMO_PASSWORDS = {
  owner: "KwXNZFWPMsTM",
  manager: "LJm-fA1YXj07",
  accountant: "ya2vq4mYqZbR",
  ramesh: "kDetJt-ZSkSi",
  suresh: "hAMhGRlAAnVw",
};

const SLUG = "mighty-movers";

function istDay(offset: number): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + offset));
  return day.toISOString().slice(0, 10);
}

async function wipe(client: PrismaClient, tenantId: string) {
  await client.$executeRawUnsafe(`ALTER TABLE ledger_events DISABLE TRIGGER ledger_no_mutation`);
  try {
    await client.breathTest.deleteMany({ where: { tenantId } });
    await client.leaveRequest.deleteMany({ where: { tenantId } });
    await client.trackerState.deleteMany({ where: { tenantId } });
    await client.archiveRecord.deleteMany({ where: { tenantId } });
    await client.deviceLog.deleteMany({ where: { tenantId } });
    await client.device.deleteMany({ where: { tenantId } });
    await client.paymentAllocation.deleteMany({ where: { tenantId } });
    await client.payment.deleteMany({ where: { tenantId } });
    await client.purchase.deleteMany({ where: { tenantId } });
    await client.outboxMail.deleteMany({ where: { tenantId } });
    await client.attendance.deleteMany({ where: { tenantId } });
    await client.payrollAdjustment.deleteMany({ where: { tenantId } });
    await client.alertRule.deleteMany({ where: { tenantId } });
    await client.documentOverride.deleteMany({ where: { tenantId } });
    await client.expenseClaim.deleteMany({ where: { tenantId } });
    await client.settlement.deleteMany({ where: { tenantId } });
    await client.tripStop.deleteMany({ where: { tenantId } });
    await client.alert.deleteMany({ where: { tenantId } });
    await client.booking.deleteMany({ where: { tenantId } });
    await client.seriesCounter.deleteMany({ where: { tenantId } });
    await client.proof.deleteMany({ where: { tenantId } });
    await client.fuelFill.deleteMany({ where: { tenantId } });
    await client.invoice.deleteMany({ where: { tenantId } });
    await client.assignment.deleteMany({ where: { tenantId } });
    await client.quote.deleteMany({ where: { tenantId } });
    await client.truckDocument.deleteMany({ where: { tenantId } });
    await client.workshopJob.deleteMany({ where: { tenantId } });
    await client.tyre.deleteMany({ where: { tenantId } });
    await client.trip.deleteMany({ where: { tenantId } });
    await client.storedFile.deleteMany({ where: { tenantId } });
    await client.user.deleteMany({ where: { tenantId } });
    await client.ledgerEvent.deleteMany({ where: { tenantId } });
    await client.driver.deleteMany({ where: { tenantId } });
    await client.truck.deleteMany({ where: { tenantId } });
    await client.branch.deleteMany({ where: { tenantId } });
    await client.party.deleteMany({ where: { tenantId } });
    await client.tenant.delete({ where: { id: tenantId } });
  } finally {
    await client.$executeRawUnsafe(`ALTER TABLE ledger_events ENABLE TRIGGER ledger_no_mutation`);
  }
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) await wipe(prisma, existing.id);

  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: "Mighty Movers", settings: DEFAULT_SETTINGS },
  });
  const tid = tenant.id;

  const ramesh = await prisma.driver.create({
    data: {
      tenantId: tid,
      name: "Ramesh Pawar",
      phone: "9845011101",
      dlNumber: "MH14 2022001141",
      dlExpiry: new Date(`${istDay(220)}T00:00:00.000Z`),
      badgeNumber: "BD-441",
      badgeExpiry: new Date(`${istDay(180)}T00:00:00.000Z`),
      monthlySalary: "28000.00",
    },
  });
  const suresh = await prisma.driver.create({
    data: {
      tenantId: tid,
      name: "Suresh More",
      phone: "9845011102",
      dlNumber: "MH14 2023002288",
      dlExpiry: new Date(`${istDay(18)}T00:00:00.000Z`),
      badgeNumber: "BD-442",
      badgeExpiry: new Date(`${istDay(40)}T00:00:00.000Z`),
      monthlySalary: "26000.00",
    },
  });

  const accounts = [
    ["Brij Pal", "owner@mighty-movers.example", "OWNER", DEMO_PASSWORDS.owner, null],
    ["Anil Joshi", "manager@mighty-movers.example", "MANAGER", DEMO_PASSWORDS.manager, null],
    ["Kavita Shah", "accountant@mighty-movers.example", "ACCOUNTANT", DEMO_PASSWORDS.accountant, null],
    ["Ramesh Pawar", "ramesh@mighty-movers.example", "DRIVER", DEMO_PASSWORDS.ramesh, ramesh.id],
    ["Suresh More", "suresh@mighty-movers.example", "DRIVER", DEMO_PASSWORDS.suresh, suresh.id],
  ] as const;
  const users: Record<string, string> = {};
  for (const [name, email, role, password, driverId] of accounts) {
    const user = await prisma.user.create({
      data: { tenantId: tid, name, email, role, passwordHash: hashPassword(password), driverId },
    });
    users[role === "DRIVER" ? email : role] = user.id;
  }
  const actor: Actor = {
    id: users.MANAGER,
    tenantId: tid,
    role: "MANAGER",
    name: "Anil Joshi",
    driverId: null,
  };
  const owner: Actor = {
    id: users.OWNER,
    tenantId: tid,
    role: "OWNER",
    name: "Brij Pal",
    driverId: null,
  };

  const benz = await prisma.truck.create({
    data: {
      tenantId: tid,
      regNo: "MH14MM3501",
      make: "BharatBenz",
      model: "3523",
      capacityTons: "35.00",
      wheels: 16,
      status: "available",
      expectedKmpl: "3.20",
      odometerKm: 148000,
    },
  });
  const signa = await prisma.truck.create({
    data: {
      tenantId: tid,
      regNo: "MH14MM3502",
      make: "Tata",
      model: "Signa 3525",
      capacityTons: "35.00",
      wheels: 16,
      status: "available",
      expectedKmpl: "3.10",
      odometerKm: 121400,
    },
  });

  const branch = await prisma.branch.create({
    data: { tenantId: tid, name: "Pune HQ", code: "PUNE" },
  });
  await prisma.user.updateMany({ where: { tenantId: tid }, data: { branchId: branch.id } });
  await prisma.truck.update({
    where: { id: benz.id },
    data: {
      branchId: branch.id,
      ownershipType: "OWN",
      purchaseCost: "4250000",
      depreciationPct: "15",
      loanEmi: "78500",
      financer: "Sundaram Finance",
      bodyType: "Container",
      trailerDetails: "40 ft tri-axle",
    },
  });
  await prisma.truck.update({
    where: { id: signa.id },
    data: {
      branchId: branch.id,
      ownershipType: "OWN",
      purchaseCost: "3980000",
      depreciationPct: "15",
      loanEmi: "74200",
      financer: "Tata Motors Finance",
      bodyType: "Open body",
      trailerDetails: "32 ft tri-axle",
    },
  });
  const rameshAadhaar = "2341 5678 9012";
  const sureshAadhaar = "3456 7890 1234";
  await prisma.driver.update({
    where: { id: ramesh.id },
    data: {
      address: "Kothrud, Pune",
      aadhaarEnc: encryptField(rameshAadhaar),
      aadhaarLast4: last4(rameshAadhaar),
      panEnc: encryptField("ABCPR1234R"),
      panLast4: "234R",
      bankAccountEnc: encryptField("501002220011"),
      bankLast4: "0011",
      bankIfscEnc: encryptField("HDFC0001234"),
      policeVerification: "Pune rural, clear, Jan 2026",
      referenceNotes: "Neighbour S. Patil, 9845000011",
      emergencyName: "Sunita Pawar",
      emergencyPhone: "9845000091",
      medicalExpiry: new Date(`${istDay(200)}T00:00:00.000Z`),
      biometricConsentAt: new Date(),
    },
  });
  await prisma.driver.update({
    where: { id: suresh.id },
    data: {
      address: "Hadapsar, Pune",
      aadhaarEnc: encryptField(sureshAadhaar),
      aadhaarLast4: last4(sureshAadhaar),
      panEnc: encryptField("BCDPS5678S"),
      panLast4: "678S",
      bankAccountEnc: encryptField("612003330022"),
      bankLast4: "0022",
      bankIfscEnc: encryptField("SBIN0000456"),
      policeVerification: "Pune city, clear, Mar 2026",
      referenceNotes: "Cousin A. More, 9845000022",
      emergencyName: "Lata More",
      emergencyPhone: "9845000092",
      medicalExpiry: new Date(`${istDay(90)}T00:00:00.000Z`),
      biometricConsentAt: new Date(),
    },
  });

  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: benz.id,
      kind: "GPS",
      serial: "GPS-3501",
      vendor: "iTriangle",
      firmware: "4.1.0",
      simNumber: "8991000000003501",
      warrantyUntil: new Date(`${istDay(400)}T00:00:00.000Z`),
      ais140Until: new Date(`${istDay(150)}T00:00:00.000Z`),
    },
  });
  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: benz.id,
      kind: "IMMOBILISER",
      serial: "IM-3501",
      vendor: "Accolade",
      firmware: "1.4.2",
      warrantyUntil: new Date(`${istDay(300)}T00:00:00.000Z`),
    },
  });
  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: benz.id,
      kind: "MDVR",
      serial: "MDVR-3501",
      vendor: "Streamax",
      firmware: "8.0.3",
      config: { channels: 8, cameras: 6, retentionDays: 15 },
    },
  });
  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: signa.id,
      kind: "GPS",
      serial: "GPS-3502",
      vendor: "iTriangle",
      firmware: "4.1.0",
      simNumber: "8991000000003502",
      ais140Until: new Date(`${istDay(110)}T00:00:00.000Z`),
    },
  });
  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: signa.id,
      kind: "ELOCK",
      serial: "EL-3502",
      vendor: "Sensorise",
      firmware: "3.2.1",
      config: { otp: "446688" },
    },
  });
  await prisma.device.create({
    data: {
      tenantId: tid,
      truckId: signa.id,
      kind: "DMS",
      serial: "DMS-3502",
      vendor: "Netradyne",
      firmware: "2.9.0",
    },
  });

  const ganesh = await prisma.party.create({
    data: {
      tenantId: tid,
      name: "Shree Ganesh Steel",
      kind: "customer",
      tags: ["customer", "consignee"],
      gstin: "27AAPCM8501F1Z8",
      pan: "AAPCM8501F",
      phone: "9822011001",
      city: "Pune",
    },
  });
  const coils = await prisma.party.create({
    data: {
      tenantId: tid,
      name: "Western Coil Mills",
      kind: "consignor",
      tags: ["consignor"],
      gstin: "27AABCU4410Q1Z2",
      phone: "9822011002",
      city: "Mumbai",
    },
  });
  const agro = await prisma.party.create({
    data: {
      tenantId: tid,
      name: "Nashik Agro Pack",
      kind: "consignee",
      tags: ["consignee", "customer"],
      gstin: "27AAGFN2201P1Z6",
      phone: "9822011003",
      city: "Nashik",
    },
  });
  await prisma.party.create({
    data: {
      tenantId: tid,
      name: "Deccan Load Brokers",
      kind: "broker",
      tags: ["broker"],
      phone: "9822011004",
      city: "Pune",
    },
  });
  await prisma.quote.create({
    data: {
      tenantId: tid,
      partyId: ganesh.id,
      origin: "Mumbai",
      destination: "Pune",
      amount: "92000",
      note: "Last carried rate for coils",
    },
  });
  await prisma.quote.create({
    data: {
      tenantId: tid,
      partyId: agro.id,
      origin: "Pune",
      destination: "Nashik",
      amount: "78000",
      note: "Last machinery trip",
    },
  });

  const docs: [string, string, string, number][] = [
    [benz.id, "RC", "MH14MM3501RC", 400],
    [benz.id, "FITNESS", "FIT-3501", 200],
    [benz.id, "INSURANCE", "ICICI-88421", 12],
    [benz.id, "PUC", "PUC-3501", 5],
    [benz.id, "NATIONAL_PERMIT", "NP-3501", 180],
    [benz.id, "STATE_PERMIT", "SP-MH-3501", 90],
    [benz.id, "ROAD_TAX", "TAX-3501", 300],
    [benz.id, "FASTAG", "FT-3501", 60],
    [benz.id, "AIS140", "AIS-3501", 150],
    [signa.id, "RC", "MH14MM3502RC", 500],
    [signa.id, "NATIONAL_PERMIT", "NP-3502", -4],
    [signa.id, "INSURANCE", "NIC-22910", 90],
    [signa.id, "FITNESS", "FIT-3502", 20],
    [signa.id, "PUC", "PUC-3502", 45],
    [signa.id, "FASTAG", "FT-3502", 25],
    [signa.id, "STATE_PERMIT", "SP-MH-3502", 70],
    [signa.id, "ROAD_TAX", "TAX-3502", 240],
    [signa.id, "AIS140", "AIS-3502", 110],
  ];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tid}, true)`;
    await appendLedger(tx, {
      tenantId: tid,
      eventType: "tenant.opened",
      entityType: "tenant",
      entityId: tid,
      actorId: actor.id,
      payload: { slug: SLUG, trucks: [benz.regNo, signa.regNo], drivers: [ramesh.name, suresh.name] },
    });
    for (const truck of [benz, signa]) {
      await appendLedger(tx, {
        tenantId: tid,
        eventType: "truck.ownership",
        entityType: "truck",
        entityId: truck.id,
        actorId: actor.id,
        payload: { truck: truck.regNo, ownershipType: "OWN" },
      });
    }
    for (const driver of [ramesh, suresh]) {
      await appendLedger(tx, {
        tenantId: tid,
        eventType: "driver.updated",
        entityType: "driver",
        entityId: driver.id,
        actorId: actor.id,
        payload: { name: driver.name, kycChanged: true },
      });
    }
    for (const [truckId, docType, docNumber, offset] of docs) {
      const filed = await registerDocument(tx, actor, { truckId, docType, docNumber, expiresOn: istDay(offset) });
      if (!filed.ok) throw new Error(filed.error);
    }

    async function runTrip(input: {
      number: string;
      truckId: string;
      driverId: string;
      customerId: string;
      consignorId: string;
      consigneeId: string;
      origin: string;
      destination: string;
      goods: string;
      weightTons: number;
      rate: number;
      seal?: string;
      through: "LOADING" | "IN_TRANSIT" | "CLOSED";
      by?: Actor;
      overrideReason?: string;
    }) {
      const who = input.by ?? actor;
      const created = await createTrip(tx, who, {
        number: input.number,
        truckId: input.truckId,
        driverId: input.driverId,
        customerId: input.customerId,
        consignorId: input.consignorId,
        consigneeId: input.consigneeId,
        origin: input.origin,
        destination: input.destination,
        goods: input.goods,
        weightTons: input.weightTons,
        rateBasis: "FIXED",
        rate: input.rate,
        overrideReason: input.overrideReason,
      });
      if (!created.ok) throw new Error(created.error);
      const id = created.data.id;
      const toLoading = await advanceTrip(tx, actor, id);
      if (!toLoading.ok) throw new Error(toLoading.error);
      if (input.through === "LOADING") return id;
      const sealed = await setSeal(tx, actor, id, input.seal ?? "SL-0000");
      if (!sealed.ok) throw new Error(sealed.error);
      for (const kind of ["LOAD_PHOTO", "WEIGHBRIDGE_LOAD", "SEAL_PHOTO", "CONSIGNOR_SIGNATURE"] as const) {
        const proof = await addProof(tx, actor, {
          tripId: id,
          kind,
          bytes: labeledSvg(kind.replaceAll("_", " "), `${input.number} · ${input.seal ?? ""}`),
          mime: "image/svg+xml",
          capture: "stamped_still",
          note: "Seeded proof",
        });
        if (!proof.ok) throw new Error(proof.error);
      }
      const rolling = await advanceTrip(tx, actor, id);
      if (!rolling.ok) throw new Error(rolling.error);
      if (input.through === "IN_TRANSIT") return id;
      const fresh = await tx.trip.findFirstOrThrow({ where: { id } });
      const otp = await verifyPodOtp(tx, actor, id, fresh.podOtp ?? "");
      if (!otp.ok) throw new Error(otp.error);
      for (const kind of ["SEAL_INTACT", "UNLOAD_PHOTO", "WEIGHBRIDGE_UNLOAD", "SIGNATURE"] as const) {
        const proof = await addProof(tx, actor, {
          tripId: id,
          kind,
          bytes: labeledSvg(kind.replaceAll("_", " "), input.number),
          mime: "image/svg+xml",
          capture: "stamped_still",
        });
        if (!proof.ok) throw new Error(proof.error);
      }
      const delivered = await advanceTrip(tx, actor, id);
      if (!delivered.ok) throw new Error(delivered.error);
      const settled = await recordSettlement(tx, actor, id, 1500, "Food and toll balance cleared");
      if (!settled.ok) throw new Error(settled.error);
      const closed = await advanceTrip(tx, actor, id);
      if (!closed.ok) throw new Error(closed.error);
      return id;
    }

    const closedId = await runTrip({
      number: "TRP-1002",
      truckId: benz.id,
      driverId: ramesh.id,
      customerId: ganesh.id,
      consignorId: coils.id,
      consigneeId: ganesh.id,
      origin: "Mumbai",
      destination: "Pune",
      goods: "HR coils",
      weightTons: 32.1,
      rate: 88000,
      seal: "SL-2201",
      through: "CLOSED",
    });
    const transitId = await runTrip({
      number: "TRP-1003",
      truckId: benz.id,
      driverId: ramesh.id,
      customerId: ganesh.id,
      consignorId: coils.id,
      consigneeId: ganesh.id,
      origin: "Mumbai",
      destination: "Pune",
      goods: "HR coils",
      weightTons: 31.8,
      rate: 91000,
      seal: "SL-4412",
      through: "IN_TRANSIT",
    });
    await tx.trip.update({
      where: { id: transitId },
      data: {
        ewayBillNo: "311008877665",
        ewayValidUntil: new Date(Date.now() + 5 * 60 * 60 * 1000),
        loadWeightKg: 31800,
      },
    });
    await runTrip({
      number: "TRP-1004",
      truckId: signa.id,
      driverId: suresh.id,
      customerId: agro.id,
      consignorId: ganesh.id,
      consigneeId: agro.id,
      origin: "Pune",
      destination: "Nashik",
      goods: "Packaged machinery",
      weightTons: 28,
      rate: 76000,
      through: "LOADING",
      by: owner,
      overrideReason: "National permit renewal is with the RTO; owner allowed this loading",
    });

    const baseline = await recordFuel(tx, actor, {
      truckId: benz.id,
      litres: 380,
      amount: 34960,
      odometer: 148000,
      station: "BPCL Khopoli",
      method: "FLEET_CARD",
    });
    if (!baseline.ok) throw new Error(baseline.error);
    const approved = await decideFuel(tx, actor, baseline.data.id, "approved");
    if (!approved.ok) throw new Error(approved.error);
    const short = await recordFuel(tx, actor, {
      truckId: benz.id,
      litres: 200,
      amount: 18400,
      odometer: 148400,
      station: "IOCL Talegaon",
      method: "FLEET_CARD",
    });
    if (!short.ok) throw new Error(short.error);
    const shortDecision = await decideFuel(tx, actor, short.data.id, "approved");
    if (!shortDecision.ok) throw new Error(shortDecision.error);
    const pending = await recordFuel(tx, actor, {
      truckId: signa.id,
      litres: 150,
      amount: 13800,
      odometer: 121550,
      station: "HPCL Hadapsar",
      method: "OFFICE_UPI",
    });
    if (!pending.ok) throw new Error(pending.error);

    const invoice = await createInvoice(tx, actor, {
      partyId: ganesh.id,
      tripId: closedId,
      taxable: 88000,
      gstMode: "EIGHTEEN_ITC",
    });
    if (!invoice.ok) throw new Error(invoice.error);
    const small = await createInvoice(tx, actor, {
      partyId: ganesh.id,
      tripId: closedId,
      taxable: 2500,
      gstMode: "FIVE_NO_ITC",
    });
    if (!small.ok) throw new Error(small.error);

    const brake = await tx.workshopJob.create({
      data: {
        tenantId: tid,
        truckId: signa.id,
        title: "Brake lining, rear drive axle",
        dueOn: new Date(`${istDay(4)}T00:00:00.000Z`),
        dueKm: 125000,
        status: "scheduled",
        cost: "8500",
        vendor: "Hadapsar Auto",
      },
    });
    const oil = await tx.workshopJob.create({
      data: {
        tenantId: tid,
        truckId: benz.id,
        title: "Engine oil and filters",
        dueOn: new Date(`${istDay(18)}T00:00:00.000Z`),
        dueKm: 160000,
        status: "scheduled",
        cost: "6400",
        vendor: "Mighty workshop",
      },
    });
    await appendLedger(tx, {
      tenantId: tid,
      eventType: "workshop.scheduled",
      entityType: "workshop_job",
      entityId: brake.id,
      actorId: actor.id,
      payload: { truck: signa.regNo, title: brake.title, dueOn: istDay(4) },
    });
    await appendLedger(tx, {
      tenantId: tid,
      eventType: "workshop.scheduled",
      entityType: "workshop_job",
      entityId: oil.id,
      actorId: actor.id,
      payload: { truck: benz.regNo, title: oil.title, dueOn: istDay(18) },
    });

    const tyres = [
      [benz.id, "TY-3501-S1", "Steer L", 48200],
      [benz.id, "TY-3501-S2", "Steer R", 48200],
      [benz.id, "TY-3501-D1", "Drive 1 outer L", 22100],
      [benz.id, "TY-3501-D2", "Drive 1 outer R", 22100],
      [signa.id, "TY-3502-S1", "Steer L", 51000],
      [signa.id, "TY-3502-S2", "Steer R", 19800],
      [signa.id, "TY-3502-T1", "Trailer axle 2 L", 64000],
      [signa.id, "TY-3502-T2", "Trailer axle 2 R", 64000],
    ] as const;
    for (const [truckId, serial, position, kmRun] of tyres) {
      const tyre = await tx.tyre.create({ data: { tenantId: tid, truckId, serial, position, kmRun } });
      await appendLedger(tx, {
        tenantId: tid,
        eventType: "tyre.fitted",
        entityType: "tyre",
        entityId: tyre.id,
        actorId: actor.id,
        payload: { serial, position, kmRun },
      });
    }
  }, { timeout: 60000 });

  console.log(`Seeded ${SLUG}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
