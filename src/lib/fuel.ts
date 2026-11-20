import { can } from "./access";
import { haversineMeters, theftNotes } from "./expenses";
import type { Actor } from "./session";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { parseSettings } from "./settings";

export async function recordFuel(
  tx: Tx,
  actor: Actor,
  input: {
    truckId: string;
    tripId?: string | null;
    litres: number;
    amount: number;
    odometer: number;
    station: string;
    method: "FLEET_CARD" | "OFFICE_UPI";
    tankBefore?: number | null;
    tankAfter?: number | null;
    parkedDropLitres?: number | null;
    pumpLat?: number | null;
    pumpLng?: number | null;
    driverLat?: number | null;
    driverLng?: number | null;
  },
) {
  if (!["FLEET_CARD", "OFFICE_UPI"].includes(input.method)) {
    return { ok: false as const, error: "Fuel is paid by fleet card or office UPI" };
  }
  const truck = await tx.truck.findFirst({ where: { id: input.truckId, tenantId: actor.tenantId } });
  if (!truck) return { ok: false as const, error: "Truck not found" };
  const tenant = await tx.tenant.findFirst({ where: { id: actor.tenantId } });
  const settings = parseSettings(tenant?.settings);
  if (actor.role === "DRIVER") {
    if (input.driverLat == null || input.driverLng == null || input.pumpLat == null || input.pumpLng == null) {
      return { ok: false as const, error: "A driver fuel request needs the pump and the phone GPS" };
    }
    const distance = haversineMeters(
      { lat: input.driverLat, lng: input.driverLng },
      { lat: input.pumpLat, lng: input.pumpLng },
    );
    if (distance > settings.fuelPumpRadiusM) {
      return { ok: false as const, error: "GPS is not at the pump" };
    }
  }
  const previous = await tx.fuelFill.findFirst({
    where: { tenantId: actor.tenantId, truckId: truck.id, status: "approved" },
    orderBy: { odometer: "desc" },
  });
  let kmpl: number | null = null;
  let flagged = false;
  const notes = theftNotes({
    litres: input.litres,
    tankBefore: input.tankBefore,
    tankAfter: input.tankAfter,
    parkedDropLitres: input.parkedDropLitres,
    dropLimit: settings.fuelDropLitres,
  });
  if (notes.length) flagged = true;
  if (previous && input.odometer > previous.odometer && input.litres > 0) {
    kmpl = (input.odometer - previous.odometer) / input.litres;
    if (kmpl < Number(truck.expectedKmpl) * settings.kmplShortfallRatio) {
      flagged = true;
      notes.push(`km/l ${kmpl.toFixed(2)} is short of ${Number(truck.expectedKmpl).toFixed(2)}`);
    }
  }
  const fill = await tx.fuelFill.create({
    data: {
      tenantId: actor.tenantId,
      truckId: truck.id,
      tripId: input.tripId || null,
      litres: input.litres.toFixed(2),
      amount: input.amount.toFixed(2),
      odometer: input.odometer,
      station: input.station.trim(),
      method: input.method,
      status: "pending",
      kmpl: kmpl == null ? null : kmpl.toFixed(2),
      flagged,
      tankBefore: input.tankBefore == null ? null : input.tankBefore.toFixed(2),
      tankAfter: input.tankAfter == null ? null : input.tankAfter.toFixed(2),
      pumpLat: input.pumpLat ?? null,
      pumpLng: input.pumpLng ?? null,
      theftNote: notes.join("; ") || null,
      paid: false,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "fuel.requested",
    entityType: "fuel_fill",
    entityId: fill.id,
    actorId: actor.id,
    payload: {
      truck: truck.regNo,
      litres: input.litres.toFixed(2),
      odometer: input.odometer,
      station: fill.station,
      method: input.method,
      kmpl: kmpl == null ? null : kmpl.toFixed(2),
      flagged,
      theft: notes,
    },
  });
  return { ok: true as const, data: fill };
}

export async function decideFuel(tx: Tx, actor: Actor, fillId: string, decision: "approved" | "rejected") {
  if (!can(actor, "fuel.approve")) {
    return { ok: false as const, error: "You cannot approve fuel" };
  }
  const fill = await tx.fuelFill.findFirst({
    where: { id: fillId, tenantId: actor.tenantId },
    include: { truck: true },
  });
  if (!fill) return { ok: false as const, error: "Fuel entry not found" };
  if (fill.status !== "pending") return { ok: false as const, error: "This fill is already decided" };
  await tx.fuelFill.update({ where: { id: fill.id }, data: { status: decision } });
  if (decision === "approved") {
    await tx.truck.update({
      where: { id: fill.truckId },
      data: { odometerKm: Math.max(fill.truck.odometerKm, fill.odometer) },
    });
  }
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: decision === "approved" ? "fuel.approved" : "fuel.rejected",
    entityType: "fuel_fill",
    entityId: fill.id,
    actorId: actor.id,
    payload: { truck: fill.truck.regNo, station: fill.station, status: decision, flagged: fill.flagged },
  });
  return { ok: true as const, data: { status: decision } };
}
