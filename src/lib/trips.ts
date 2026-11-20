import { randomInt } from "node:crypto";
import type { Actor } from "./session";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { storeBytes } from "./files";
import { round2 } from "./format";

const NEXT: Record<string, string> = {
  PLANNED: "LOADING",
  LOADING: "IN_TRANSIT",
  IN_TRANSIT: "DELIVERED",
  DELIVERED: "CLOSED",
};

export type TripShape = {
  sealNumber: string | null;
  podOtpOk: boolean;
  proofs: { kind: string }[];
};

export function polMissing(trip: TripShape): string[] {
  const kinds = new Set(trip.proofs.map((proof) => proof.kind));
  const missing: string[] = [];
  if (!trip.sealNumber) missing.push("seal number");
  if (!kinds.has("LOAD_PHOTO")) missing.push("load photo");
  if (!kinds.has("WEIGHBRIDGE_LOAD")) missing.push("weighbridge slip");
  return missing;
}

export function podMissing(trip: TripShape): string[] {
  const kinds = new Set(trip.proofs.map((proof) => proof.kind));
  const missing: string[] = [];
  if (!trip.podOtpOk) missing.push("consignee OTP");
  if (!kinds.has("SIGNATURE")) missing.push("signature");
  return missing;
}

function assertDesk(actor: Actor) {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") {
    return "Only the owner or a manager can change a trip";
  }
  return null;
}

async function nextCode(tx: Tx, tenantId: string, kind: "trip" | "lr") {
  const rows = await tx.trip.findMany({
    where: { tenantId },
    select: { number: true, lrNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const source = kind === "trip" ? row.number : row.lrNumber;
    if (!source) continue;
    const match = source.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = max + 1;
  if (kind === "trip") return `TRP-${next}`;
  return `MM-${String(next).padStart(4, "0")}`;
}

export function makeOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function createTrip(
  tx: Tx,
  actor: Actor,
  input: {
    number?: string;
    truckId: string;
    driverId: string;
    customerId?: string | null;
    consignorId?: string | null;
    consigneeId?: string | null;
    origin: string;
    destination: string;
    goods: string;
    weightTons: number;
    rateBasis: "PER_TONNE" | "FIXED" | "PER_KM";
    rate: number;
    distanceKm?: number | null;
  },
) {
  const denied = assertDesk(actor);
  if (denied) return { ok: false as const, error: denied };
  const truck = await tx.truck.findFirst({ where: { id: input.truckId, tenantId: actor.tenantId } });
  const driver = await tx.driver.findFirst({ where: { id: input.driverId, tenantId: actor.tenantId } });
  if (!truck || !driver) return { ok: false as const, error: "Truck or driver is not in this workspace" };
  const busyTruck = await tx.trip.findFirst({
    where: { tenantId: actor.tenantId, truckId: truck.id, status: { in: ["LOADING", "IN_TRANSIT"] } },
  });
  if (busyTruck) return { ok: false as const, error: `${truck.regNo} is already on ${busyTruck.number}` };
  const busyDriver = await tx.trip.findFirst({
    where: { tenantId: actor.tenantId, driverId: driver.id, status: { in: ["LOADING", "IN_TRANSIT"] } },
  });
  if (busyDriver) return { ok: false as const, error: `${driver.name} is already on ${busyDriver.number}` };
  let freight = input.rate;
  if (input.rateBasis === "PER_TONNE") freight = input.rate * input.weightTons;
  if (input.rateBasis === "PER_KM") {
    if (!input.distanceKm) return { ok: false as const, error: "A per-km rate needs the distance" };
    freight = input.rate * input.distanceKm;
  }
  freight = round2(freight);
  const number = input.number ?? (await nextCode(tx, actor.tenantId, "trip"));
  const lrNumber = await nextCode(tx, actor.tenantId, "lr");
  const trip = await tx.trip.create({
    data: {
      tenantId: actor.tenantId,
      number,
      status: "PLANNED",
      truckId: truck.id,
      driverId: driver.id,
      customerId: input.customerId || null,
      consignorId: input.consignorId || null,
      consigneeId: input.consigneeId || null,
      origin: input.origin.trim(),
      destination: input.destination.trim(),
      goods: input.goods.trim(),
      weightTons: input.weightTons.toFixed(2),
      rateBasis: input.rateBasis,
      rate: input.rate.toFixed(2),
      freight: freight.toFixed(2),
      lrNumber,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "trip.created",
    entityType: "trip",
    entityId: trip.id,
    actorId: actor.id,
    payload: {
      number: trip.number,
      lrNumber,
      status: "PLANNED",
      origin: trip.origin,
      destination: trip.destination,
      truck: truck.regNo,
      driver: driver.name,
      goods: trip.goods,
      weightTons: input.weightTons.toFixed(2),
      freight: freight.toFixed(2),
      rateBasis: input.rateBasis,
    },
  });
  return { ok: true as const, data: trip };
}

export async function setSeal(tx: Tx, actor: Actor, tripId: string, seal: string) {
  const trip = await tx.trip.findFirst({ where: { id: tripId, tenantId: actor.tenantId } });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  if (actor.role === "DRIVER" && actor.driverId !== trip.driverId) {
    return { ok: false as const, error: "This is not your duty" };
  }
  if (!["PLANNED", "LOADING"].includes(trip.status)) {
    return { ok: false as const, error: "The seal is set before the truck leaves" };
  }
  const sealNumber = seal.trim().toUpperCase();
  if (sealNumber.length < 3) return { ok: false as const, error: "Enter the seal number" };
  await tx.trip.update({ where: { id: trip.id }, data: { sealNumber } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "trip.seal_set",
    entityType: "trip",
    entityId: trip.id,
    actorId: actor.id,
    payload: { number: trip.number, sealNumber },
  });
  return { ok: true as const, data: { sealNumber } };
}

export async function verifyPodOtp(tx: Tx, actor: Actor, tripId: string, otp: string) {
  const trip = await tx.trip.findFirst({ where: { id: tripId, tenantId: actor.tenantId } });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  if (actor.role === "DRIVER" && actor.driverId !== trip.driverId) {
    return { ok: false as const, error: "This is not your duty" };
  }
  if (!trip.podOtp) return { ok: false as const, error: "Dispatch has not put this trip in transit yet" };
  if (otp.trim() !== trip.podOtp) return { ok: false as const, error: "OTP does not match" };
  await tx.trip.update({ where: { id: trip.id }, data: { podOtpOk: true } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "pod.otp_verified",
    entityType: "trip",
    entityId: trip.id,
    actorId: actor.id,
    payload: { number: trip.number, result: "match" },
  });
  return { ok: true as const, data: { ok: true } };
}

export async function addProof(
  tx: Tx,
  actor: Actor,
  input: {
    tripId: string;
    kind: string;
    bytes: Buffer;
    mime: string;
    capture: "camera" | "stamped_still";
    note?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
) {
  const allowed = new Set([
    "LOAD_PHOTO",
    "SEAL_PHOTO",
    "WEIGHBRIDGE_LOAD",
    "WEIGHBRIDGE_UNLOAD",
    "UNLOAD_PHOTO",
    "SEAL_INTACT",
    "SIGNATURE",
  ]);
  if (!allowed.has(input.kind)) return { ok: false as const, error: "Unknown proof kind" };
  if (input.capture !== "camera" && input.capture !== "stamped_still") {
    return { ok: false as const, error: "Proofs come from the camera" };
  }
  const trip = await tx.trip.findFirst({ where: { id: input.tripId, tenantId: actor.tenantId } });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  if (actor.role === "DRIVER" && actor.driverId !== trip.driverId) {
    return { ok: false as const, error: "This is not your duty" };
  }
  const file = await storeBytes(tx, actor.tenantId, input.bytes, input.mime, input.kind);
  const proof = await tx.proof.create({
    data: {
      tenantId: actor.tenantId,
      tripId: trip.id,
      kind: input.kind,
      fileId: file.id,
      capture: input.capture,
      note: input.note ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "proof.added",
    entityType: "proof",
    entityId: proof.id,
    actorId: actor.id,
    payload: {
      tripNumber: trip.number,
      kind: input.kind,
      capture: input.capture,
      sha256: file.sha256,
    },
    fileHashes: [file.sha256],
  });
  return { ok: true as const, data: proof };
}

export async function advanceTrip(tx: Tx, actor: Actor, tripId: string) {
  const denied = assertDesk(actor);
  if (denied) return { ok: false as const, error: denied };
  const trip = await tx.trip.findFirst({
    where: { id: tripId, tenantId: actor.tenantId },
    include: { proofs: true, truck: true },
  });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  const to = NEXT[trip.status];
  if (!to) return { ok: false as const, error: "This trip is already closed" };
  if (to === "IN_TRANSIT") {
    const missing = polMissing(trip);
    if (missing.length) return { ok: false as const, error: `Proof of loading still needs ${missing.join(", ")}` };
  }
  if (to === "DELIVERED") {
    const missing = podMissing(trip);
    if (missing.length) return { ok: false as const, error: `Proof of delivery still needs ${missing.join(", ")}` };
  }
  const podOtp = to === "IN_TRANSIT" ? makeOtp() : trip.podOtp;
  await tx.trip.update({
    where: { id: trip.id },
    data: {
      status: to,
      podOtp,
      startedAt: to === "IN_TRANSIT" ? new Date() : trip.startedAt,
    },
  });
  if (to === "LOADING") {
    await tx.truck.update({ where: { id: trip.truckId }, data: { status: "loading" } });
    await tx.assignment.create({
      data: {
        tenantId: actor.tenantId,
        driverId: trip.driverId,
        truckId: trip.truckId,
        tripId: trip.id,
        startedAt: new Date(),
      },
    });
  }
  if (to === "IN_TRANSIT") {
    await tx.truck.update({ where: { id: trip.truckId }, data: { status: "in_transit" } });
    console.info(`POD OTP for ${trip.number}: ${podOtp}`);
  }
  if (to === "DELIVERED" || to === "CLOSED") {
    const open = await tx.trip.count({
      where: {
        tenantId: actor.tenantId,
        truckId: trip.truckId,
        id: { not: trip.id },
        status: { in: ["PLANNED", "LOADING", "IN_TRANSIT"] },
      },
    });
    if (open === 0) {
      await tx.truck.update({
        where: { id: trip.truckId },
        data: { status: to === "CLOSED" ? "available" : "delivered" },
      });
    }
  }
  if (to === "CLOSED") {
    await tx.assignment.updateMany({
      where: { tenantId: actor.tenantId, tripId: trip.id, endedAt: null },
      data: { endedAt: new Date() },
    });
  }
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "trip.status",
    entityType: "trip",
    entityId: trip.id,
    actorId: actor.id,
    payload: { number: trip.number, from: trip.status, to, truck: trip.truck.regNo },
  });
  return { ok: true as const, data: { status: to } };
}
