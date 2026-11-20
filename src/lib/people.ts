import { can } from "./access";
import { decryptField, encryptField, last4, maskLast4 } from "./crypto";
import type { Tx } from "./db";
import { appendLedger } from "./ledger";
import type { Actor } from "./session";

const PARTY_TAGS = ["customer", "consignor", "consignee", "broker", "attached_owner", "vendor"] as const;
export type PartyTag = (typeof PARTY_TAGS)[number];
export const PARTY_TAG_LIST = PARTY_TAGS;

type DriverRow = {
  id: string;
  name: string;
  aadhaarEnc: string | null;
  aadhaarLast4: string | null;
  panEnc: string | null;
  panLast4: string | null;
  bankAccountEnc: string | null;
  bankLast4: string | null;
  bankIfscEnc: string | null;
};

export function presentSecret(actor: Actor, encrypted: string | null, tail: string | null): string {
  if (can(actor, "drivers.kyc") && encrypted) return decryptField(encrypted);
  return maskLast4(tail);
}

export function presentDriver(actor: Actor, driver: DriverRow) {
  return {
    aadhaar: presentSecret(actor, driver.aadhaarEnc, driver.aadhaarLast4),
    pan: presentSecret(actor, driver.panEnc, driver.panLast4),
    bankAccount: presentSecret(actor, driver.bankAccountEnc, driver.bankLast4),
    bankIfsc: can(actor, "drivers.kyc") && driver.bankIfscEnc ? decryptField(driver.bankIfscEnc) : "••••",
  };
}

export async function saveDriverProfile(
  tx: Tx,
  actor: Actor,
  input: {
    driverId: string;
    address?: string;
    aadhaar?: string;
    pan?: string;
    bankAccount?: string;
    bankIfsc?: string;
    policeVerification?: string;
    referenceNotes?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    medicalExpiry?: string;
    biometricConsent?: boolean;
  },
) {
  if (!can(actor, "drivers.manage") && !can(actor, "drivers.kyc")) {
    return { ok: false as const, error: "You cannot edit driver records" };
  }
  const driver = await tx.driver.findFirst({ where: { id: input.driverId, tenantId: actor.tenantId } });
  if (!driver) return { ok: false as const, error: "Driver not found" };
  const data: Record<string, unknown> = {
    address: input.address?.trim() || driver.address,
    policeVerification: input.policeVerification?.trim() || driver.policeVerification,
    referenceNotes: input.referenceNotes?.trim() || driver.referenceNotes,
    emergencyName: input.emergencyName?.trim() || driver.emergencyName,
    emergencyPhone: input.emergencyPhone?.trim() || driver.emergencyPhone,
  };
  if (input.medicalExpiry) data.medicalExpiry = new Date(`${input.medicalExpiry}T00:00:00.000Z`);
  if (input.biometricConsent && !driver.biometricConsentAt) data.biometricConsentAt = new Date();
  if (can(actor, "drivers.kyc")) {
    if (input.aadhaar?.trim()) {
      data.aadhaarEnc = encryptField(input.aadhaar.trim());
      data.aadhaarLast4 = last4(input.aadhaar);
    }
    if (input.pan?.trim()) {
      data.panEnc = encryptField(input.pan.trim().toUpperCase());
      data.panLast4 = last4(input.pan);
    }
    if (input.bankAccount?.trim()) {
      data.bankAccountEnc = encryptField(input.bankAccount.trim());
      data.bankLast4 = last4(input.bankAccount);
    }
    if (input.bankIfsc?.trim()) data.bankIfscEnc = encryptField(input.bankIfsc.trim().toUpperCase());
  }
  await tx.driver.update({ where: { id: driver.id }, data });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "driver.updated",
    entityType: "driver",
    entityId: driver.id,
    actorId: actor.id,
    payload: {
      name: driver.name,
      kycChanged: Boolean(input.aadhaar || input.pan || input.bankAccount || input.bankIfsc),
      medicalExpiry: input.medicalExpiry ?? null,
    },
  });
  return { ok: true as const, data: { id: driver.id } };
}

export async function saveParty(
  tx: Tx,
  actor: Actor,
  input: { id?: string; name: string; tags: string[]; gstin?: string; pan?: string; phone?: string; city?: string },
) {
  if (!can(actor, "parties.manage")) return { ok: false as const, error: "You cannot edit parties" };
  const tags = input.tags.filter((tag) => (PARTY_TAGS as readonly string[]).includes(tag));
  if (!input.name.trim() || tags.length === 0) return { ok: false as const, error: "A party needs a name and at least one tag" };
  const payload = {
    name: input.name.trim(),
    kind: tags[0],
    tags,
    gstin: input.gstin?.trim() || null,
    pan: input.pan?.trim().toUpperCase() || null,
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
  };
  const party = input.id
    ? await tx.party.update({ where: { id: input.id }, data: payload })
    : await tx.party.create({ data: { tenantId: actor.tenantId, ...payload } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: input.id ? "party.updated" : "party.created",
    entityType: "party",
    entityId: party.id,
    actorId: actor.id,
    payload: { name: party.name, tags },
  });
  return { ok: true as const, data: party };
}

export async function saveTruckOwnership(
  tx: Tx,
  actor: Actor,
  input: {
    truckId: string;
    ownershipType: "OWN" | "ATTACHED" | "MARKET";
    ownerPartyId?: string | null;
    hireTerms?: string;
    purchaseCost?: number | null;
    depreciationPct?: number | null;
    loanEmi?: number | null;
    financer?: string;
    bodyType?: string;
    trailerDetails?: string;
  },
) {
  if (!can(actor, "fleet.manage")) return { ok: false as const, error: "You cannot edit the fleet" };
  const truck = await tx.truck.findFirst({ where: { id: input.truckId, tenantId: actor.tenantId } });
  if (!truck) return { ok: false as const, error: "Truck not found" };
  await tx.truck.update({
    where: { id: truck.id },
    data: {
      ownershipType: input.ownershipType,
      ownerPartyId: input.ownerPartyId || null,
      hireTerms: input.hireTerms?.trim() || null,
      purchaseCost: input.purchaseCost == null ? null : input.purchaseCost.toFixed(2),
      depreciationPct: input.depreciationPct == null ? null : input.depreciationPct.toFixed(2),
      loanEmi: input.loanEmi == null ? null : input.loanEmi.toFixed(2),
      financer: input.financer?.trim() || null,
      bodyType: input.bodyType?.trim() || null,
      trailerDetails: input.trailerDetails?.trim() || null,
    },
  });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "truck.ownership",
    entityType: "truck",
    entityId: truck.id,
    actorId: actor.id,
    payload: {
      truck: truck.regNo,
      ownershipType: input.ownershipType,
      financer: input.financer?.trim() || null,
      loanEmi: input.loanEmi == null ? null : input.loanEmi.toFixed(2),
    },
  });
  return { ok: true as const, data: { id: truck.id } };
}

export async function savePermissionOverrides(
  tx: Tx,
  actor: Actor,
  input: { userId: string; grant: string[]; revoke: string[] },
) {
  if (actor.role !== "OWNER") return { ok: false as const, error: "Only the owner edits permissions" };
  const user = await tx.user.findFirst({ where: { id: input.userId, tenantId: actor.tenantId } });
  if (!user) return { ok: false as const, error: "User not found" };
  const permissionOverrides = {
    grant: input.grant.map((item) => item.trim()).filter(Boolean),
    revoke: input.revoke.map((item) => item.trim()).filter(Boolean),
  };
  await tx.user.update({ where: { id: user.id }, data: { permissionOverrides } });
  await appendLedger(tx, {
    tenantId: actor.tenantId,
    eventType: "user.permissions",
    entityType: "user",
    entityId: user.id,
    actorId: actor.id,
    payload: { email: user.email, grant: permissionOverrides.grant, revoke: permissionOverrides.revoke },
  });
  return { ok: true as const, data: permissionOverrides };
}
