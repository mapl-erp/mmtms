import { can } from "./access";
import type { Tx } from "./db";
import { labeledSvg, storeBytes } from "./files";
import { haversineMeters } from "./expenses";
import { raiseAlert } from "./lifecycle";
import { appendLedger } from "./ledger";
import type { Actor } from "./session";
import { parseSettings } from "./settings";

export const CAMERAS = ["front road", "cabin", "cargo", "rear", "blind spot left", "blind spot right"] as const;

export interface ImmobiliserPort {
  cut(serial: string, reason: string): Promise<void>;
  restore(serial: string): Promise<void>;
}
export interface ElockPort {
  unlock(serial: string): Promise<void>;
}
export interface DmsPort {
  event(serial: string, kind: string): Promise<{ kind: string; at: string }>;
}
export interface VideoPort {
  clip(serial: string, camera: string): Promise<{ label: string }>;
}

export class SimulatedImmobiliser implements ImmobiliserPort {
  async cut(_serial: string, _reason: string) {}
  async restore(_serial: string) {}
}
export class SimulatedElock implements ElockPort {
  async unlock(_serial: string) {}
}
export class SimulatedDms implements DmsPort {
  async event(_serial: string, kind: string) {
    return { kind, at: new Date().toISOString() };
  }
}
export class SimulatedVideo implements VideoPort {
  async clip(_serial: string, camera: string) {
    return { label: camera };
  }
}

export const hardware = {
  immobiliser: new SimulatedImmobiliser(),
  elock: new SimulatedElock(),
  dms: new SimulatedDms(),
  video: new SimulatedVideo(),
};

export function immobiliseBlock(speedKmh: number, maxKmh: number): string | null {
  if (speedKmh > maxKmh) return "Engine cut-off only when the truck is slow or stopped";
  return null;
}

export function elockBlock(input: { otp: string; expected: string; distanceM: number; radiusM: number }): string | null {
  if (input.otp.trim() !== input.expected) return "E-lock OTP does not match";
  if (input.distanceM > input.radiusM) return "E-lock opens only inside the delivery geofence";
  return null;
}

async function logDevice(tx: Tx, actor: Actor, deviceId: string, truckId: string | null, action: string, note: string) {
  const row = await tx.deviceLog.create({
    data: { tenantId: actor.tenantId, deviceId, truckId, action, note, actorId: actor.id },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: `device.${action}`,
    entityType: "device_log",
    entityId: row.id,
    actorId: actor.id,
    payload: { action, note },
  });
  return row;
}

export async function immobilise(tx: Tx, actor: Actor, input: { deviceId: string; reason: string; speedKmh: number }) {
  if (!can(actor, "devices.command")) return { ok: false as const, error: "You cannot command a device" };
  if (input.reason.trim().length < 4) return { ok: false as const, error: "Record who asked and why" };
  const device = await tx.device.findFirst({ where: { id: input.deviceId, tenantId: actor.tenantId } });
  if (!device || device.kind !== "IMMOBILISER") return { ok: false as const, error: "Immobiliser not found" };
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  const block = immobiliseBlock(input.speedKmh, settings.immobiliserMaxKmh);
  if (block) return { ok: false as const, error: block };
  await hardware.immobiliser.cut(device.serial, input.reason.trim());
  await logDevice(tx, actor, device.id, device.truckId, "immobilise", `${actor.name}: ${input.reason.trim()} at ${input.speedKmh} km/h`);
  return { ok: true as const, data: { serial: device.serial } };
}

export async function unlockElock(
  tx: Tx,
  actor: Actor,
  input: { deviceId: string; otp: string; lat: number; lng: number; dropLat: number; dropLng: number },
) {
  const device = await tx.device.findFirst({ where: { id: input.deviceId, tenantId: actor.tenantId } });
  if (!device || device.kind !== "ELOCK") return { ok: false as const, error: "E-lock not found" };
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  const expected = String((device.config as { otp?: string } | null)?.otp ?? "");
  const distance = haversineMeters({ lat: input.lat, lng: input.lng }, { lat: input.dropLat, lng: input.dropLng });
  const block = elockBlock({ otp: input.otp, expected, distanceM: distance, radiusM: settings.geofenceRadiusM });
  if (block) return { ok: false as const, error: block };
  await hardware.elock.unlock(device.serial);
  await logDevice(tx, actor, device.id, device.truckId, "unlock", `Opened ${Math.round(distance)} m from the drop`);
  return { ok: true as const, data: { distance } };
}

export async function recordDms(tx: Tx, actor: Actor, input: { deviceId: string; kind: "drowsiness" | "phone" | "smoking" }) {
  const device = await tx.device.findFirst({ where: { id: input.deviceId, tenantId: actor.tenantId } });
  if (!device || device.kind !== "DMS") return { ok: false as const, error: "Driver monitor not found" };
  const event = await hardware.dms.event(device.serial, input.kind);
  await raiseAlert(tx, actor, {
    rule: `dms_${input.kind}`,
    severity: "high",
    message: `${device.serial} reported ${input.kind}`,
    entityType: "device",
    entityId: device.id,
    recipients: ["MANAGER"],
  });
  await logDevice(tx, actor, device.id, device.truckId, "dms", event.kind);
  return { ok: true as const, data: event };
}

export async function storeVideoClip(tx: Tx, actor: Actor, input: { deviceId: string; camera: string }) {
  const device = await tx.device.findFirst({ where: { id: input.deviceId, tenantId: actor.tenantId } });
  if (!device || device.kind !== "MDVR") return { ok: false as const, error: "Recorder not found" };
  if (!CAMERAS.includes(input.camera as (typeof CAMERAS)[number])) return { ok: false as const, error: "Unknown camera" };
  await hardware.video.clip(device.serial, input.camera);
  const file = await storeBytes(tx, actor.tenantId, labeledSvg(input.camera, device.serial), "image/svg+xml", input.camera);
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "video.clip",
    entityType: "device",
    entityId: device.id,
    actorId: actor.id,
    payload: { serial: device.serial, camera: input.camera, sha256: file.sha256 },
    fileHashes: [file.sha256],
  });
  return { ok: true as const, data: { sha256: file.sha256 } };
}

export async function panic(tx: Tx, actor: Actor, tripId: string | null) {
  await raiseAlert(tx, actor, {
    rule: "panic",
    severity: "high",
    message: `${actor.name} pressed the panic button`,
    entityType: "trip",
    entityId: tripId ?? actor.id,
    recipients: ["OWNER", "MANAGER"],
  });
  return { ok: true as const, data: { sent: true } };
}

export function ignitionOutsideDuty(input: { hour: number; activeTrip: boolean; start: number; end: number }): boolean {
  if (!input.activeTrip) return true;
  return input.hour < input.start || input.hour >= input.end;
}
