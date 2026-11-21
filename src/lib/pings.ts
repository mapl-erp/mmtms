import type { Tx } from "./db";
import { CORRIDORS, type Point } from "./gps";
import { raiseAlert } from "./lifecycle";
import type { Actor } from "./session";
import { parseSettings, type TenantSettings } from "./settings";
import { drivingAlerts, evaluatePing, signalLossFromAge, type TrackerSnapshot, type Zone } from "./tracking";

function snapshot(row: {
  lat: number;
  lng: number;
  speedKmh: number;
  pingAt: Date;
  stoppedSince: Date | null;
  stopAlerted: boolean;
  overspeedAlerted: boolean;
  deviationAlerted: boolean;
  zones: unknown;
  tamperOpen: boolean;
  powerCutOpen: boolean;
  signalLost: boolean;
} | null): TrackerSnapshot | null {
  if (!row) return null;
  return {
    lat: row.lat,
    lng: row.lng,
    speedKmh: row.speedKmh,
    pingAt: row.pingAt.toISOString(),
    stoppedSince: row.stoppedSince?.toISOString() ?? null,
    stopAlerted: row.stopAlerted,
    overspeedAlerted: row.overspeedAlerted,
    deviationAlerted: row.deviationAlerted,
    zones: Array.isArray(row.zones) ? (row.zones as TrackerSnapshot["zones"]) : [],
    tamperOpen: row.tamperOpen,
    powerCutOpen: row.powerCutOpen,
    signalLost: row.signalLost,
  };
}

export async function zonesForTruck(tx: Tx, tenantId: string, truckId: string, settings: TenantSettings): Promise<Zone[]> {
  const trip = await tx.trip.findFirst({
    where: { tenantId, truckId, status: { in: ["LOADING", "IN_TRANSIT"] } },
    orderBy: { createdAt: "desc" },
  });
  const zones: Zone[] = [{ name: "yard", lat: settings.yardLat, lng: settings.yardLng }];
  if (!trip) return zones;
  const cities: Record<string, Point> = {
    Mumbai: { lat: 19.076, lng: 72.878 },
    Pune: { lat: 18.52, lng: 73.856 },
    Nashik: { lat: 19.997, lng: 73.789 },
  };
  const origin = cities[trip.origin];
  const destination = cities[trip.destination];
  if (origin) zones.push({ name: "loading", ...origin });
  if (destination) zones.push({ name: "delivery", ...destination });
  return zones;
}

export async function ingestPing(
  tx: Tx,
  actor: Actor,
  input: {
    truckId: string;
    regNo: string;
    lat: number;
    lng: number;
    speedKmh: number;
    at?: Date;
    route?: Point[];
    tamper?: boolean;
    powerCut?: boolean;
    signalLoss?: boolean;
  },
) {
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  const current = await tx.trackerState.findUnique({ where: { truckId: input.truckId } });
  const at = input.at ?? new Date();
  const evaluated = evaluatePing(snapshot(current), {
    regNo: input.regNo,
    lat: input.lat,
    lng: input.lng,
    speedKmh: input.speedKmh,
    at,
    route: input.route ?? CORRIDORS[input.regNo] ?? [],
    zones: await zonesForTruck(tx, actor.tenantId, input.truckId, settings),
    tamper: input.tamper,
    powerCut: input.powerCut,
    signalLoss: input.signalLoss,
  }, settings);
  const trip = await tx.trip.findFirst({
    where: { tenantId: actor.tenantId, truckId: input.truckId, status: "IN_TRANSIT" },
    orderBy: { startedAt: "desc" },
  });
  if (trip?.startedAt) {
    const hours = (at.getTime() - trip.startedAt.getTime()) / 3_600_000;
    const driving = drivingAlerts(input.regNo, hours, trip.driveReminderSent, trip.driveAlertSent, settings);
    evaluated.alerts.push(...driving.alerts);
    if (driving.reminderSent !== trip.driveReminderSent || driving.alertSent !== trip.driveAlertSent) {
      await tx.trip.update({
        where: { id: trip.id },
        data: { driveReminderSent: driving.reminderSent, driveAlertSent: driving.alertSent },
      });
    }
  }
  const next = evaluated.next;
  await tx.trackerState.upsert({
    where: { truckId: input.truckId },
    create: {
      tenantId: actor.tenantId,
      truckId: input.truckId,
      lat: next.lat,
      lng: next.lng,
      speedKmh: next.speedKmh,
      pingAt: at,
      stoppedSince: next.stoppedSince ? new Date(next.stoppedSince) : null,
      stopAlerted: next.stopAlerted,
      overspeedAlerted: next.overspeedAlerted,
      deviationAlerted: next.deviationAlerted,
      zones: next.zones,
      tamperOpen: next.tamperOpen,
      powerCutOpen: next.powerCutOpen,
      signalLost: next.signalLost,
    },
    update: {
      lat: next.lat,
      lng: next.lng,
      speedKmh: next.speedKmh,
      pingAt: at,
      stoppedSince: next.stoppedSince ? new Date(next.stoppedSince) : null,
      stopAlerted: next.stopAlerted,
      overspeedAlerted: next.overspeedAlerted,
      deviationAlerted: next.deviationAlerted,
      zones: next.zones,
      tamperOpen: next.tamperOpen,
      powerCutOpen: next.powerCutOpen,
      signalLost: next.signalLost,
    },
  });
  for (const alert of evaluated.alerts) {
    await raiseAlert(tx, actor, {
      rule: alert.rule,
      severity: alert.severity,
      message: alert.message,
      entityType: "truck",
      entityId: input.truckId,
      recipients: alert.recipients,
    });
  }
  return evaluated.alerts;
}

export async function sweepSignal(tx: Tx, actor: Actor, now = new Date()) {
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  const trucks = await tx.truck.findMany({ where: { tenantId: actor.tenantId }, include: { devices: true } });
  let raised = 0;
  for (const truck of trucks) {
    const state = await tx.trackerState.findUnique({ where: { truckId: truck.id } });
    const alert = signalLossFromAge(truck.regNo, state?.pingAt ?? null, now, settings, state?.signalLost ?? false);
    if (!alert || !state) continue;
    await tx.trackerState.update({ where: { truckId: truck.id }, data: { signalLost: true } });
    await raiseAlert(tx, actor, { ...alert, entityType: "truck", entityId: truck.id });
    raised += 1;
  }
  return raised;
}
