import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import { parseSettings } from "./settings";
import type { Actor } from "./session";

export function financialYear(date = new Date()): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

export function formatLr(fy: string, value: number): string {
  return `MM/${fy}/${String(value).padStart(4, "0")}`;
}

export async function nextFyLr(tx: Tx, tenantId: string, date = new Date()): Promise<string> {
  const fy = financialYear(date);
  const series = `LR-${fy}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO series_counters (tenant_id, series, value)
    VALUES (${tenantId}::uuid, ${series}, 1)
    ON CONFLICT (tenant_id, series)
    DO UPDATE SET value = series_counters.value + 1
    RETURNING value
  `;
  return formatLr(fy, Number(rows[0]?.value ?? 1));
}

export function ewayWarning(
  trip: { status: string; ewayValidUntil: Date | null },
  settings: { ewayWarnHours: number },
  now = new Date(),
): string | null {
  if (!trip.ewayValidUntil || !["LOADING", "IN_TRANSIT"].includes(trip.status)) return null;
  const hours = (trip.ewayValidUntil.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return "E-way bill has expired while the truck is still out";
  if (hours <= settings.ewayWarnHours) return `E-way bill expires in ${Math.max(0, Math.floor(hours))}h`;
  return null;
}

export function roundTripProfit(input: {
  freights: number[];
  fuel: number[];
  expenses: number[];
  commission: number;
}): number {
  const freight = input.freights.reduce((sum, item) => sum + item, 0);
  const fuel = input.fuel.reduce((sum, item) => sum + item, 0);
  const expenses = input.expenses.reduce((sum, item) => sum + item, 0);
  return Math.round((freight - fuel - expenses - input.commission) * 100) / 100;
}

export async function closureBlockers(tx: Tx, tenantId: string, trip: { id: string; podOtpOk: boolean; proofs: { kind: string }[] }) {
  const kinds = new Set(trip.proofs.map((proof) => proof.kind));
  const blocks: string[] = [];
  if (!trip.podOtpOk) blocks.push("consignee OTP");
  if (!kinds.has("SIGNATURE")) blocks.push("signature");
  const settlement = await tx.settlement.findUnique({ where: { tripId: trip.id } });
  if (!settlement) blocks.push("driver settlement");
  const pending = await tx.expenseClaim.count({ where: { tenantId, tripId: trip.id, status: "pending" } });
  if (pending > 0) blocks.push("pending expenses");
  return blocks;
}

export async function recordSettlement(tx: Tx, actor: Actor, tripId: string, amount: number, note: string) {
  const trip = await tx.trip.findFirst({ where: { id: tripId, tenantId: actor.tenantId } });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  const settlement = await tx.settlement.upsert({
    where: { tripId: trip.id },
    create: { tenantId: actor.tenantId, tripId: trip.id, amount: amount.toFixed(2), note },
    update: { amount: amount.toFixed(2), note, settledAt: new Date() },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "trip.settled",
    entityType: "settlement",
    entityId: settlement.id,
    actorId: actor.id,
    payload: { number: trip.number, amount: amount.toFixed(2), note },
  });
  return { ok: true as const, data: settlement };
}

export async function raiseAlert(
  tx: Tx,
  actor: { tenantId: string; id: string | null },
  input: { rule: string; severity: string; message: string; entityType: string; entityId: string; recipients: string[] },
) {
  const alert = await tx.alert.create({
    data: {
      tenantId: actor.tenantId,
      rule: input.rule,
      severity: input.severity,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      recipients: input.recipients,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "alert.raised",
    entityType: "alert",
    entityId: alert.id,
    actorId: actor.id,
    payload: { rule: input.rule, message: input.message, recipients: input.recipients },
  });
  return alert;
}

export async function recordDeliveryFacts(
  tx: Tx,
  actor: Actor,
  tripId: string,
  input: { podSeal?: string; loadWeightKg?: number | null; unloadWeightKg?: number | null; shortageNote?: string },
) {
  const trip = await tx.trip.findFirst({ where: { id: tripId, tenantId: actor.tenantId } });
  if (!trip) return { ok: false as const, error: "Trip not found" };
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } });
  const settings = parseSettings(tenant.settings);
  const podSeal = input.podSeal?.trim().toUpperCase() || trip.podSealNumber;
  await tx.trip.update({
    where: { id: trip.id },
    data: {
      podSealNumber: podSeal,
      loadWeightKg: input.loadWeightKg ?? trip.loadWeightKg,
      unloadWeightKg: input.unloadWeightKg ?? trip.unloadWeightKg,
      shortageNote: input.shortageNote?.trim() || trip.shortageNote,
    },
  });
  if (podSeal && trip.sealNumber && podSeal !== trip.sealNumber) {
    await raiseAlert(tx, actor, {
      rule: "seal_mismatch",
      severity: "high",
      message: `${trip.number} seal ${podSeal} does not match loading seal ${trip.sealNumber}`,
      entityType: "trip",
      entityId: trip.id,
      recipients: ["OWNER", "MANAGER"],
    });
  }
  const load = input.loadWeightKg ?? trip.loadWeightKg;
  const unload = input.unloadWeightKg ?? trip.unloadWeightKg;
  if (load != null && unload != null && Math.abs(load - unload) > settings.weightShortageKg) {
    await raiseAlert(tx, actor, {
      rule: "weight_shortage",
      severity: "high",
      message: `${trip.number} weight moved from ${load} kg to ${unload} kg`,
      entityType: "trip",
      entityId: trip.id,
      recipients: ["OWNER", "MANAGER"],
    });
  }
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "pod.facts",
    entityType: "trip",
    entityId: trip.id,
    actorId: actor.id,
    payload: { number: trip.number, podSeal: podSeal ?? null, loadWeightKg: load ?? null, unloadWeightKg: unload ?? null },
  });
  return { ok: true as const, data: { podSeal } };
}
