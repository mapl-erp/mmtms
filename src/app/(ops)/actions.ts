"use server";

import { redirect } from "next/navigation";
import { loadActor } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { createInvoice, type GstMode } from "@/lib/billing";
import { registerDocument } from "@/lib/fleet";
import { decideFuel, recordFuel } from "@/lib/fuel";
import { saveDriverProfile, saveParty, savePermissionOverrides, saveTruckOwnership } from "@/lib/people";
import { requireSession } from "@/lib/session";
import { advanceTrip, createTrip } from "@/lib/trips";
import { completeJob } from "@/lib/workshop";

function back(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

export async function createTripAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    createTrip(tx, await loadActor(tx, session), {
      truckId: String(formData.get("truckId") ?? ""),
      driverId: String(formData.get("driverId") ?? ""),
      customerId: String(formData.get("customerId") ?? "") || null,
      consignorId: String(formData.get("consignorId") ?? "") || null,
      consigneeId: String(formData.get("consigneeId") ?? "") || null,
      origin: String(formData.get("origin") ?? ""),
      destination: String(formData.get("destination") ?? ""),
      goods: String(formData.get("goods") ?? ""),
      weightTons: Number(formData.get("weightTons") ?? 0),
      rateBasis: String(formData.get("rateBasis") ?? "FIXED") as "PER_TONNE" | "FIXED" | "PER_KM",
      rate: Number(formData.get("rate") ?? 0),
      distanceKm: formData.get("distanceKm") ? Number(formData.get("distanceKm")) : null,
      overrideReason: String(formData.get("overrideReason") ?? ""),
    }),
  );
  if (!result.ok) back("/trips", result.error);
  redirect(`/trips/${result.data.id}`);
}

export async function advanceTripAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("tripId") ?? "");
  const result = await withTenant(session.tid, async (tx) => advanceTrip(tx, await loadActor(tx, session), id));
  if (!result.ok) back(`/trips/${id}`, result.error);
  redirect(`/trips/${id}`);
}

export async function decideFuelAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("fillId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "rejected";
  const result = await withTenant(session.tid, async (tx) => decideFuel(tx, await loadActor(tx, session), id, decision));
  back("/fuel", result.ok ? undefined : result.error);
}

export async function recordFuelAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    recordFuel(tx, await loadActor(tx, session), {
      truckId: String(formData.get("truckId") ?? ""),
      litres: Number(formData.get("litres") ?? 0),
      amount: Number(formData.get("amount") ?? 0),
      odometer: Number(formData.get("odometer") ?? 0),
      station: String(formData.get("station") ?? ""),
      method: String(formData.get("method") ?? "FLEET_CARD") as "FLEET_CARD" | "OFFICE_UPI",
    }),
  );
  back("/fuel", result.ok ? undefined : result.error);
}

export async function createInvoiceAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    createInvoice(tx, await loadActor(tx, session), {
      partyId: String(formData.get("partyId") ?? ""),
      tripId: String(formData.get("tripId") ?? "") || null,
      taxable: Number(formData.get("taxable") ?? 0),
      gstMode: String(formData.get("gstMode") ?? "EIGHTEEN_ITC") as GstMode,
    }),
  );
  back("/billing", result.ok ? undefined : result.error);
}

export async function registerDocumentAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    registerDocument(tx, await loadActor(tx, session), {
      truckId: String(formData.get("truckId") ?? ""),
      docType: String(formData.get("docType") ?? ""),
      docNumber: String(formData.get("docNumber") ?? ""),
      expiresOn: String(formData.get("expiresOn") ?? ""),
    }),
  );
  back("/fleet", result.ok ? undefined : result.error);
}

export async function completeJobAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    completeJob(tx, await loadActor(tx, session), String(formData.get("jobId") ?? "")),
  );
  back("/workshop", result.ok ? undefined : result.error);
}

export async function previewTamperAction() {
  await requireSession();
  redirect("/evidence?preview=1");
}

export async function saveDriverAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    saveDriverProfile(tx, await loadActor(tx, session), {
      driverId: String(formData.get("driverId") ?? ""),
      address: String(formData.get("address") ?? ""),
      aadhaar: String(formData.get("aadhaar") ?? ""),
      pan: String(formData.get("pan") ?? ""),
      bankAccount: String(formData.get("bankAccount") ?? ""),
      bankIfsc: String(formData.get("bankIfsc") ?? ""),
      policeVerification: String(formData.get("policeVerification") ?? ""),
      referenceNotes: String(formData.get("referenceNotes") ?? ""),
      emergencyName: String(formData.get("emergencyName") ?? ""),
      emergencyPhone: String(formData.get("emergencyPhone") ?? ""),
      medicalExpiry: String(formData.get("medicalExpiry") ?? ""),
      biometricConsent: formData.get("biometricConsent") === "on",
    }),
  );
  back("/drivers", result.ok ? undefined : result.error);
}

export async function savePartyAction(formData: FormData) {
  const session = await requireSession();
  const tags = formData.getAll("tags").map(String);
  const result = await withTenant(session.tid, async (tx) =>
    saveParty(tx, await loadActor(tx, session), {
      name: String(formData.get("name") ?? ""),
      tags,
      gstin: String(formData.get("gstin") ?? ""),
      pan: String(formData.get("pan") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      city: String(formData.get("city") ?? ""),
    }),
  );
  back("/parties", result.ok ? undefined : result.error);
}

export async function saveOwnershipAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    saveTruckOwnership(tx, await loadActor(tx, session), {
      truckId: String(formData.get("truckId") ?? ""),
      ownershipType: String(formData.get("ownershipType") ?? "OWN") as "OWN" | "ATTACHED" | "MARKET",
      ownerPartyId: String(formData.get("ownerPartyId") ?? "") || null,
      hireTerms: String(formData.get("hireTerms") ?? ""),
      purchaseCost: formData.get("purchaseCost") ? Number(formData.get("purchaseCost")) : null,
      depreciationPct: formData.get("depreciationPct") ? Number(formData.get("depreciationPct")) : null,
      loanEmi: formData.get("loanEmi") ? Number(formData.get("loanEmi")) : null,
      financer: String(formData.get("financer") ?? ""),
      bodyType: String(formData.get("bodyType") ?? ""),
      trailerDetails: String(formData.get("trailerDetails") ?? ""),
    }),
  );
  back("/fleet", result.ok ? undefined : result.error);
}

export async function savePermissionsAction(formData: FormData) {
  const session = await requireSession();
  const split = (value: FormDataEntryValue | null) =>
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const result = await withTenant(session.tid, async (tx) =>
    savePermissionOverrides(tx, await loadActor(tx, session), {
      userId: String(formData.get("userId") ?? ""),
      grant: split(formData.get("grant")),
      revoke: split(formData.get("revoke")),
    }),
  );
  back("/team", result.ok ? undefined : result.error);
}
