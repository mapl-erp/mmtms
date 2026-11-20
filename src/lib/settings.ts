export type TenantSettings = {
  docAlertDays: number[];
  kmplShortfallRatio: number;
  overspeedKmh: number;
  unplannedStopMin: number;
  driveReminderHours: number;
  driveAlertHours: number;
  foodDailyCapInr: number;
  ownerApprovalAboveInr: number;
  fuelDropLitres: number;
  weightShortageKg: number;
  ewayWarnHours: number;
  breathTestsPerTrip: number;
  immobiliserMaxKmh: number;
  geofenceRadiusM: number;
  retentionYears: number;
  gstRate: number;
  dutyStartHour: number;
  dutyEndHour: number;
};

export const DEFAULT_SETTINGS: TenantSettings = {
  docAlertDays: [30, 15, 7, 0],
  kmplShortfallRatio: 0.85,
  overspeedKmh: 70,
  unplannedStopMin: 60,
  driveReminderHours: 6,
  driveAlertHours: 8,
  foodDailyCapInr: 400,
  ownerApprovalAboveInr: 5000,
  fuelDropLitres: 15,
  weightShortageKg: 50,
  ewayWarnHours: 8,
  breathTestsPerTrip: 2,
  immobiliserMaxKmh: 5,
  geofenceRadiusM: 500,
  retentionYears: 6,
  gstRate: 0.18,
  dutyStartHour: 5,
  dutyEndHour: 22,
};

export function parseSettings(raw: unknown): TenantSettings {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const merged = { ...DEFAULT_SETTINGS, ...source } as TenantSettings;
  if (!Array.isArray(merged.docAlertDays) || merged.docAlertDays.length === 0) {
    merged.docAlertDays = DEFAULT_SETTINGS.docAlertDays;
  }
  return merged;
}

export function daysUntil(date: Date, now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

export function documentAlert(days: number, thresholds: number[]): "expired" | "today" | "soon" | null {
  if (days < 0) return "expired";
  const positive = [...thresholds].filter((item) => item > 0).sort((a, b) => a - b);
  if (days === 0 && thresholds.includes(0)) return "today";
  if (positive.some((item) => days <= item)) return "soon";
  return null;
}
