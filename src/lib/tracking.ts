import type { Point } from "./gps";
import { haversineMeters } from "./expenses";
import type { TenantSettings } from "./settings";

export type ZoneName = "loading" | "delivery" | "yard";

export type Zone = { name: ZoneName; lat: number; lng: number };

export type TrackerSnapshot = {
  lat: number;
  lng: number;
  speedKmh: number;
  pingAt: string | null;
  stoppedSince: string | null;
  stopAlerted: boolean;
  overspeedAlerted: boolean;
  deviationAlerted: boolean;
  zones: ZoneName[];
  tamperOpen: boolean;
  powerCutOpen: boolean;
  signalLost: boolean;
};

export type TrackingAlert = {
  rule: string;
  severity: "high" | "medium";
  message: string;
  recipients: string[];
};

export type Ping = {
  regNo: string;
  lat: number;
  lng: number;
  speedKmh: number;
  at: Date;
  route: Point[];
  zones: Zone[];
  tamper?: boolean;
  powerCut?: boolean;
  signalLoss?: boolean;
};

const MANAGER = ["MANAGER"];
const ESCALATED = ["MANAGER", "OWNER"];

function pointToPolylineM(point: Point, route: Point[]): number {
  if (route.length === 0) return 0;
  if (route.length === 1) return haversineMeters(point, route[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const steps = 8;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const sample = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      best = Math.min(best, haversineMeters(point, sample));
    }
  }
  return best;
}

function inside(ping: Ping, zone: Zone, radius: number) {
  return haversineMeters(ping, zone) <= radius;
}

export function evaluatePing(previous: TrackerSnapshot | null, ping: Ping, settings: TenantSettings): { next: TrackerSnapshot; alerts: TrackingAlert[] } {
  const alerts: TrackingAlert[] = [];
  const here = ping.zones.filter((zone) => inside(ping, zone, settings.geofenceRadiusM)).map((zone) => zone.name);
  const before = new Set(previous?.zones ?? []);
  for (const name of here) {
    if (!before.has(name)) {
      alerts.push({ rule: "geofence_entry", severity: "medium", message: `${ping.regNo} entered the ${name} geofence`, recipients: MANAGER });
    }
  }
  for (const name of before) {
    if (!here.includes(name)) {
      alerts.push({ rule: "geofence_exit", severity: "medium", message: `${ping.regNo} left the ${name} geofence`, recipients: MANAGER });
    }
  }

  let overspeedAlerted = previous?.overspeedAlerted ?? false;
  if (ping.speedKmh > settings.overspeedKmh) {
    if (!overspeedAlerted) {
      alerts.push({
        rule: "overspeed",
        severity: "high",
        message: `${ping.regNo} is at ${Math.round(ping.speedKmh)} km/h`,
        recipients: MANAGER,
      });
      overspeedAlerted = true;
    }
  } else overspeedAlerted = false;

  const offRoute = ping.route.length > 1 && pointToPolylineM(ping, ping.route) > settings.routeDeviationM;
  let deviationAlerted = previous?.deviationAlerted ?? false;
  if (offRoute) {
    if (!deviationAlerted) {
      alerts.push({ rule: "route_deviation", severity: "high", message: `${ping.regNo} left the planned corridor`, recipients: MANAGER });
      deviationAlerted = true;
    }
  } else deviationAlerted = false;

  const slow = ping.speedKmh <= settings.stopSpeedKmh;
  const sheltered = here.length > 0;
  let stoppedSince = previous?.stoppedSince ?? null;
  let stopAlerted = previous?.stopAlerted ?? false;
  if (slow && !sheltered) {
    if (!stoppedSince) stoppedSince = ping.at.toISOString();
    const minutes = (ping.at.getTime() - new Date(stoppedSince).getTime()) / 60_000;
    if (minutes >= settings.unplannedStopMin && !stopAlerted) {
      alerts.push({
        rule: "unplanned_stop",
        severity: "high",
        message: `${ping.regNo} has been stopped for ${Math.round(minutes)} minutes`,
        recipients: MANAGER,
      });
      stopAlerted = true;
    }
  } else {
    stoppedSince = null;
    stopAlerted = false;
  }

  let tamperOpen = previous?.tamperOpen ?? false;
  if (ping.tamper && !tamperOpen) {
    alerts.push({ rule: "tracker_tamper", severity: "high", message: `${ping.regNo} tracker tamper`, recipients: ESCALATED });
    tamperOpen = true;
  }
  if (!ping.tamper) tamperOpen = false;

  let powerCutOpen = previous?.powerCutOpen ?? false;
  if (ping.powerCut && !powerCutOpen) {
    alerts.push({ rule: "power_cut", severity: "high", message: `${ping.regNo} tracker power cut`, recipients: ESCALATED });
    powerCutOpen = true;
  }
  if (!ping.powerCut) powerCutOpen = false;

  let signalLost = previous?.signalLost ?? false;
  if (ping.signalLoss && !signalLost) {
    alerts.push({ rule: "signal_loss", severity: "high", message: `${ping.regNo} tracker signal lost`, recipients: MANAGER });
    signalLost = true;
  }
  if (!ping.signalLoss) signalLost = false;

  return {
    next: {
      lat: ping.lat,
      lng: ping.lng,
      speedKmh: ping.speedKmh,
      pingAt: ping.at.toISOString(),
      stoppedSince,
      stopAlerted,
      overspeedAlerted,
      deviationAlerted,
      zones: here,
      tamperOpen,
      powerCutOpen,
      signalLost,
    },
    alerts,
  };
}

export function signalLossFromAge(regNo: string, pingAt: Date | null, now: Date, settings: TenantSettings, already: boolean): TrackingAlert | null {
  if (!pingAt || already) return null;
  const minutes = (now.getTime() - pingAt.getTime()) / 60_000;
  if (minutes < settings.signalLossMin) return null;
  return { rule: "signal_loss", severity: "high", message: `${regNo} has not reported for ${Math.round(minutes)} minutes`, recipients: MANAGER };
}

export function drivingAlerts(
  regNo: string,
  hours: number,
  reminderSent: boolean,
  alertSent: boolean,
  settings: TenantSettings,
): { alerts: TrackingAlert[]; reminderSent: boolean; alertSent: boolean } {
  const alerts: TrackingAlert[] = [];
  let reminder = reminderSent;
  let firm = alertSent;
  if (hours >= settings.driveAlertHours && !firm) {
    alerts.push({ rule: "drive_limit", severity: "high", message: `${regNo} has been driving for ${hours.toFixed(1)} hours`, recipients: MANAGER });
    firm = true;
    reminder = true;
  } else if (hours >= settings.driveReminderHours && !reminder) {
    alerts.push({ rule: "drive_reminder", severity: "medium", message: `${regNo} has been driving for ${hours.toFixed(1)} hours. Rest is due.`, recipients: MANAGER });
    reminder = true;
  }
  return { alerts, reminderSent: reminder, alertSent: firm };
}
