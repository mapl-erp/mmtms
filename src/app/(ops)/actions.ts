"use server";

import { redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { createInvoice, type GstMode } from "@/lib/billing";
import { registerDocument } from "@/lib/fleet";
import { decideFuel, recordFuel } from "@/lib/fuel";
import { actorFrom, requireSession } from "@/lib/session";
import { advanceTrip, createTrip } from "@/lib/trips";
import { completeJob } from "@/lib/workshop";

function back(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

export async function createTripAction(formData: FormData) {
  const session = await requireSession();
  const actor = actorFrom(session);
  const result = await withTenant(session.tid, (tx) =>
    createTrip(tx, actor, {
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
    }),
  );
  if (!result.ok) back("/trips", result.error);
  redirect(`/trips/${result.data.id}`);
}

export async function advanceTripAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("tripId") ?? "");
  const result = await withTenant(session.tid, (tx) => advanceTrip(tx, actorFrom(session), id));
  if (!result.ok) back(`/trips/${id}`, result.error);
  redirect(`/trips/${id}`);
}

export async function decideFuelAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("fillId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approved" | "rejected";
  const result = await withTenant(session.tid, (tx) => decideFuel(tx, actorFrom(session), id, decision));
  back("/fuel", result.ok ? undefined : result.error);
}

export async function recordFuelAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, (tx) =>
    recordFuel(tx, actorFrom(session), {
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
  const result = await withTenant(session.tid, (tx) =>
    createInvoice(tx, actorFrom(session), {
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
  const result = await withTenant(session.tid, (tx) =>
    registerDocument(tx, actorFrom(session), {
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
  const result = await withTenant(session.tid, (tx) =>
    completeJob(tx, actorFrom(session), String(formData.get("jobId") ?? "")),
  );
  back("/workshop", result.ok ? undefined : result.error);
}

export async function previewTamperAction() {
  await requireSession();
  redirect("/evidence?preview=1");
}
