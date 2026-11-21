import type { Tx } from "./db";
import { raiseAlert } from "./lifecycle";
import type { Actor } from "./session";
import { parseSettings } from "./settings";

const FAULTS: Record<string, string> = {
  "SPN100.FMI1": "Engine oil pressure low",
  "SPN110.FMI0": "Engine coolant temperature high",
  "SPN190.FMI0": "Engine speed above normal",
  "SPN94.FMI1": "Fuel delivery pressure low",
};

export function describeFault(code: string): string {
  return FAULTS[code] ?? `J1939 fault ${code}`;
}

export function tpmsStatus(pressureKpa: number, tempC: number, lowKpa: number, highTemp: number): string | null {
  if (pressureKpa < lowKpa) return `pressure ${pressureKpa} kPa is below ${lowKpa}`;
  if (tempC > highTemp) return `temperature ${tempC}°C is above ${highTemp}`;
  return null;
}

export async function ingestFault(tx: Tx, actor: Actor, input: { truckId: string; code: string }) {
  const truck = await tx.truck.findFirst({ where: { id: input.truckId, tenantId: actor.tenantId } });
  if (!truck) return { ok: false as const, error: "Truck not found" };
  const title = describeFault(input.code.trim().toUpperCase());
  const job = await tx.workshopJob.create({
    data: { tenantId: actor.tenantId, truckId: truck.id, title, status: "fault", vendor: "J1939" },
  });
  await raiseAlert(tx, actor, {
    rule: "j1939",
    severity: "high",
    message: `${truck.regNo} ${title}`,
    entityType: "workshop_job",
    entityId: job.id,
    recipients: ["MANAGER"],
  });
  return { ok: true as const, data: job };
}

export async function ingestTpms(tx: Tx, actor: Actor, input: { tyreId: string; pressureKpa: number; tempC: number }) {
  const tyre = await tx.tyre.findFirst({ where: { id: input.tyreId, tenantId: actor.tenantId }, include: { truck: true } });
  if (!tyre) return { ok: false as const, error: "Tyre not found" };
  await tx.tyre.update({
    where: { id: tyre.id },
    data: { pressureKpa: input.pressureKpa.toFixed(1), tempC: input.tempC.toFixed(1) },
  });
  const settings = parseSettings((await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } })).settings);
  const problem = tpmsStatus(input.pressureKpa, input.tempC, settings.tpmsLowKpa, settings.tpmsHighTempC);
  if (problem) {
    await raiseAlert(tx, actor, {
      rule: "tpms",
      severity: "high",
      message: `${tyre.truck.regNo} ${tyre.position} ${tyre.serial}: ${problem}`,
      entityType: "tyre",
      entityId: tyre.id,
      recipients: ["MANAGER"],
    });
  }
  return { ok: true as const, data: { problem } };
}
