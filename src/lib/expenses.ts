import { can } from "./access";
import type { Tx } from "./db";
import { storeBytes } from "./files";
import { appendLedger } from "./ledger";
import type { Actor } from "./session";
import { parseSettings, type TenantSettings } from "./settings";

export const CLAIM_CATEGORIES = ["TOLL", "LABOUR", "FOOD", "PARKING", "REPAIR", "FINE"] as const;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function theftNotes(input: {
  litres: number;
  tankBefore?: number | null;
  tankAfter?: number | null;
  parkedDropLitres?: number | null;
  dropLimit: number;
}): string[] {
  const notes: string[] = [];
  if (input.tankBefore != null && input.tankAfter != null) {
    const rise = input.tankAfter - input.tankBefore;
    if (input.litres - rise > input.dropLimit) {
      notes.push(`fill ${input.litres.toFixed(1)} L against a tank rise of ${rise.toFixed(1)} L`);
    }
  }
  if (input.parkedDropLitres != null && input.parkedDropLitres > input.dropLimit) {
    notes.push(`tank fell ${input.parkedDropLitres.toFixed(1)} L while parked`);
  }
  return notes;
}

async function settingsOf(tx: Tx, tenantId: string) {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return parseSettings(tenant.settings);
}

export async function submitClaim(
  tx: Tx,
  actor: Actor,
  input: {
    driverId: string;
    tripId?: string | null;
    category: (typeof CLAIM_CATEGORIES)[number];
    amount: number;
    claimedOn: string;
    note?: string;
    lat?: number | null;
    lng?: number | null;
    capturedAt?: string | null;
    receipt?: { bytes: Buffer; mime: string } | null;
  },
) {
  if (!can(actor, "expenses.claim") && !can(actor, "expenses.approve") && actor.role !== "OWNER") {
    return { ok: false as const, error: "You cannot file a claim" };
  }
  if (!input.receipt || input.lat == null || input.lng == null || !input.capturedAt) {
    return { ok: false as const, error: "A claim needs a receipt photo tagged with GPS and time" };
  }
  const settings = await settingsOf(tx, actor.tenantId);
  const day = new Date(`${input.claimedOn}T00:00:00.000Z`);
  let payable = input.amount;
  let note = input.note?.trim() ?? "";
  if (input.category === "FOOD") {
    const prior = await tx.expenseClaim.findMany({
      where: {
        tenantId: actor.tenantId,
        driverId: input.driverId,
        category: "FOOD",
        claimedOn: day,
        status: { not: "rejected" },
      },
    });
    const used = prior.reduce((sum, claim) => sum + Number(claim.payable), 0);
    const room = Math.max(0, settings.foodDailyCapInr - used);
    payable = Math.min(input.amount, room);
    if (payable < input.amount) note = `${note} Food payable capped at the daily allowance.`.trim();
  }
  const status = payable > settings.ownerApprovalAboveInr ? "pending_owner" : "pending";
  const receipt = await storeBytes(tx, actor.tenantId, input.receipt.bytes, input.receipt.mime, `${input.category} receipt`);
  const capturedAt = new Date(input.capturedAt);
  const claim = await tx.expenseClaim.create({
    data: {
      tenantId: actor.tenantId,
      driverId: input.driverId,
      tripId: input.tripId || null,
      category: input.category,
      amount: input.amount.toFixed(2),
      payable: payable.toFixed(2),
      status,
      note: note || null,
      claimedOn: day,
      lat: input.lat,
      lng: input.lng,
      capturedAt,
      receiptFileId: receipt.id,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "expense.submitted",
    entityType: "expense_claim",
    entityId: claim.id,
    actorId: actor.id,
    payload: { category: input.category, amount: input.amount.toFixed(2), payable: payable.toFixed(2), status },
  });
  return { ok: true as const, data: claim };
}

export async function decideClaim(tx: Tx, actor: Actor, claimId: string, decision: "approved" | "rejected") {
  const claim = await tx.expenseClaim.findFirst({ where: { id: claimId, tenantId: actor.tenantId } });
  if (!claim) return { ok: false as const, error: "Claim not found" };
  if (claim.status === "approved" || claim.status === "rejected") return { ok: false as const, error: "Already decided" };
  const settings = await settingsOf(tx, actor.tenantId);
  const high = Number(claim.payable) > settings.ownerApprovalAboveInr || claim.status === "pending_owner";
  if (high && actor.role !== "OWNER") return { ok: false as const, error: "The owner approves claims above the threshold" };
  if (!high && !can(actor, "expenses.approve")) return { ok: false as const, error: "You cannot approve claims" };
  await tx.expenseClaim.update({ where: { id: claim.id }, data: { status: decision } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: decision === "approved" ? "expense.approved" : "expense.rejected",
    entityType: "expense_claim",
    entityId: claim.id,
    actorId: actor.id,
    payload: { category: claim.category, payable: claim.payable.toString(), status: decision },
  });
  return { ok: true as const, data: { status: decision } };
}

export async function payrollFor(tx: Tx, tenantId: string, driverId: string, month: string) {
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon - 1, days));
  const driver = await tx.driver.findFirstOrThrow({ where: { id: driverId, tenantId } });
  const attendance = await tx.attendance.findMany({ where: { tenantId, driverId, day: { gte: start, lte: end } } });
  const assignments = await tx.assignment.findMany({ where: { tenantId, driverId } });
  const duty = new Set<string>();
  for (const row of assignments) {
    const from = row.startedAt < start ? start : row.startedAt;
    const to = row.endedAt && row.endedAt < end ? row.endedAt : end;
    for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + 86_400_000)) {
      if (cursor >= start && cursor <= end) duty.add(cursor.toISOString().slice(0, 10));
    }
  }
  for (const row of attendance) {
    const key = row.day.toISOString().slice(0, 10);
    if (row.status === "ON_DUTY") duty.add(key);
    if (row.status === "LEAVE" || row.status === "ABSENT" || row.status === "IDLE") duty.delete(key);
  }
  const claims = await tx.expenseClaim.findMany({
    where: { tenantId, driverId, status: "approved", claimedOn: { gte: start, lte: end } },
  });
  const adjustments = await tx.payrollAdjustment.findMany({ where: { tenantId, driverId, month } });
  const claimTotal = claims.reduce((sum, claim) => sum + Number(claim.payable), 0);
  const advances = adjustments.filter((row) => row.kind === "ADVANCE").reduce((sum, row) => sum + Number(row.amount), 0);
  const deductions = adjustments.filter((row) => row.kind === "DEDUCTION").reduce((sum, row) => sum + Number(row.amount), 0);
  const salary = (Number(driver.monthlySalary) * duty.size) / days;
  return {
    driver: driver.name,
    dutyDays: duty.size,
    days,
    salary: Math.round(salary * 100) / 100,
    advances,
    deductions,
    claims: Math.round(claimTotal * 100) / 100,
    net: Math.round((salary - advances - deductions + claimTotal) * 100) / 100,
  };
}

export async function saveThresholds(tx: Tx, actor: Actor, patch: Partial<TenantSettings>) {
  if (actor.role !== "OWNER" && !can(actor, "alerts.manage")) {
    return { ok: false as const, error: "Only the owner edits thresholds" };
  }
  await tx.$executeRaw`SELECT save_tenant_settings(${JSON.stringify(patch)}::jsonb)`;
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "settings.updated",
    entityType: "tenant",
    entityId: actor.tenantId,
    actorId: actor.id,
    payload: { keys: Object.keys(patch) },
  });
  return { ok: true as const, data: patch };
}
