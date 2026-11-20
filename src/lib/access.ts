import type { Tx } from "./db";
import type { Actor, Session } from "./session";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ["*"],
  MANAGER: [
    "desk.view",
    "fleet.manage",
    "drivers.manage",
    "parties.manage",
    "trips.manage",
    "fuel.approve",
    "workshop.manage",
    "billing.manage",
    "evidence.view",
    "map.view",
    "users.view",
  ],
  ACCOUNTANT: ["desk.view", "fleet.view", "drivers.kyc", "parties.view", "billing.manage", "evidence.view", "reports.view"],
  DRIVER: ["driver.app", "fuel.request", "expenses.claim"],
};

export type PermissionOverrides = { grant?: string[]; revoke?: string[] };

export function parseOverrides(raw: unknown): PermissionOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as { grant?: unknown; revoke?: unknown };
  const list = (item: unknown) => (Array.isArray(item) ? item.filter((entry) => typeof entry === "string") : []);
  return { grant: list(value.grant), revoke: list(value.revoke) };
}

export function can(actor: { role: string; permissionOverrides?: unknown }, permission: string): boolean {
  const overrides = parseOverrides(actor.permissionOverrides);
  const granted = new Set(ROLE_PERMISSIONS[actor.role] ?? []);
  for (const item of overrides.grant ?? []) granted.add(item);
  const revoked = new Set(overrides.revoke ?? []);
  if (revoked.has(permission) || revoked.has("*")) return false;
  if (granted.has("*") || granted.has(permission)) return true;
  return false;
}

export async function loadActor(tx: Tx, session: Session): Promise<Actor> {
  const user = await tx.user.findFirst({ where: { id: session.uid, tenantId: session.tid } });
  return {
    id: session.uid,
    tenantId: session.tid,
    role: user?.role ?? session.role,
    name: user?.name ?? session.name,
    driverId: user?.driverId ?? session.driverId,
    permissionOverrides: user?.permissionOverrides ?? {},
  };
}
