import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { CITIES, simulateTruck } from "@/lib/gps";
import { readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const trucks = await withTenant(session.tid, (tx) =>
    tx.truck.findMany({ where: { tenantId: session.tid }, orderBy: { regNo: "asc" } }),
  );
  const positions = trucks.map((truck) => ({
    ...simulateTruck(truck.regNo),
    make: truck.make,
    model: truck.model,
    status: truck.status,
  }));
  return NextResponse.json({ positions, cities: CITIES, at: new Date().toISOString() });
}
