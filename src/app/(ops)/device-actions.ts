"use server";

import { redirect } from "next/navigation";
import { loadActor } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { immobilise, recordDms, storeVideoClip, unlockElock } from "@/lib/devices";
import { requireSession } from "@/lib/session";

function back(error?: string): never {
  redirect(error ? `/devices?error=${encodeURIComponent(error)}` : "/devices");
}

export async function immobiliseAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    immobilise(tx, await loadActor(tx, session), {
      deviceId: String(formData.get("deviceId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      speedKmh: Number(formData.get("speedKmh") ?? 0),
    }),
  );
  back(result.ok ? undefined : result.error);
}

export async function unlockAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    unlockElock(tx, await loadActor(tx, session), {
      deviceId: String(formData.get("deviceId") ?? ""),
      otp: String(formData.get("otp") ?? ""),
      lat: Number(formData.get("lat") ?? 0),
      lng: Number(formData.get("lng") ?? 0),
      dropLat: 19.997,
      dropLng: 73.789,
    }),
  );
  back(result.ok ? undefined : result.error);
}

export async function dmsAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    recordDms(tx, await loadActor(tx, session), {
      deviceId: String(formData.get("deviceId") ?? ""),
      kind: String(formData.get("kind") ?? "drowsiness") as "drowsiness" | "phone" | "smoking",
    }),
  );
  back(result.ok ? undefined : result.error);
}

export async function clipAction(formData: FormData) {
  const session = await requireSession();
  const result = await withTenant(session.tid, async (tx) =>
    storeVideoClip(tx, await loadActor(tx, session), {
      deviceId: String(formData.get("deviceId") ?? ""),
      camera: String(formData.get("camera") ?? ""),
    }),
  );
  back(result.ok ? undefined : result.error);
}
