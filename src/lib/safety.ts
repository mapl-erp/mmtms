import type { Tx } from "./db";
import { raiseAlert } from "./lifecycle";
import type { Actor } from "./session";
import { parseSettings } from "./settings";

export function scheduleBreathDue(start: Date, count: number, horizonHours = 10): Date[] {
  const dates: Date[] = [];
  const span = horizonHours * 60 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    const slot = ((i + 1) / (count + 1)) * span;
    dates.push(new Date(start.getTime() + slot));
  }
  return dates;
}

export async function scheduleBreathTests(tx: Tx, tenantId: string, tripId: string, start = new Date()) {
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings);
  const existing = await tx.breathTest.count({ where: { tenantId, tripId } });
  if (existing > 0) return;
  for (const dueAt of scheduleBreathDue(start, settings.breathTestsPerTrip)) {
    await tx.breathTest.create({ data: { tenantId, tripId, dueAt, status: "pending" } });
  }
}

export async function recordBreath(
  tx: Tx,
  actor: Actor,
  input: { testId: string; passed: boolean },
) {
  const test = await tx.breathTest.findFirst({ where: { id: input.testId, tenantId: actor.tenantId }, include: { trip: true } });
  if (!test) return { ok: false as const, error: "Breath test not found" };
  if (test.status !== "pending") return { ok: false as const, error: "This test is already recorded" };
  await tx.breathTest.update({
    where: { id: test.id },
    data: { status: input.passed ? "passed" : "failed", completedAt: new Date() },
  });
  if (!input.passed) {
    await raiseAlert(tx, actor, {
      rule: "breath_fail",
      severity: "high",
      message: `${test.trip.number} breath test failed`,
      entityType: "trip",
      entityId: test.tripId,
      recipients: ["MANAGER"],
    });
  }
  return { ok: true as const, data: { status: input.passed ? "passed" : "failed" } };
}

export async function applyLeave(
  tx: Tx,
  actor: Actor,
  input: { driverId: string; startsOn: string; endsOn: string; reason: string },
) {
  if (actor.role === "DRIVER" && actor.driverId !== input.driverId) return { ok: false as const, error: "You can request leave only for yourself" };
  const starts = new Date(`${input.startsOn}T00:00:00.000Z`);
  const ends = new Date(`${input.endsOn}T00:00:00.000Z`);
  if (Number.isNaN(starts.getTime()) || ends < starts) return { ok: false as const, error: "Leave dates are not valid" };
  if (input.reason.trim().length < 3) return { ok: false as const, error: "Add a reason" };
  const row = await tx.leaveRequest.create({
    data: {
      tenantId: actor.tenantId,
      driverId: input.driverId,
      startsOn: starts,
      endsOn: ends,
      reason: input.reason.trim(),
      status: "pending",
    },
  });
  return { ok: true as const, data: row };
}

export async function decideLeave(tx: Tx, actor: Actor, requestId: string, decision: "approved" | "rejected") {
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") return { ok: false as const, error: "A manager approves leave" };
  const request = await tx.leaveRequest.findFirst({ where: { id: requestId, tenantId: actor.tenantId } });
  if (!request || request.status !== "pending") return { ok: false as const, error: "Leave request is not pending" };
  await tx.leaveRequest.update({ where: { id: request.id }, data: { status: decision } });
  if (decision === "approved") {
    for (let cursor = new Date(request.startsOn); cursor <= request.endsOn; cursor = new Date(cursor.getTime() + 86_400_000)) {
      await tx.attendance.upsert({
        where: { tenantId_driverId_day: { tenantId: actor.tenantId, driverId: request.driverId, day: cursor } },
        create: { tenantId: actor.tenantId, driverId: request.driverId, day: cursor, status: "LEAVE", source: "MANAGER", note: request.reason },
        update: { status: "LEAVE", source: "MANAGER", note: request.reason },
      });
    }
  }
  return { ok: true as const, data: { status: decision } };
}
