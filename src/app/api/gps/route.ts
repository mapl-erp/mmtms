import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { CITIES, simulateTruck } from "@/lib/gps";
import { ingestPing } from "@/lib/pings";
import { actorFrom, readSession } from "@/lib/session";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const actor = actorFrom(session);
  const positions = await withTenant(session.tid, async (tx) => {
    const trucks = await tx.truck.findMany({ where: { tenantId: session.tid }, orderBy: { regNo: "asc" } });
    const rows = [];
    for (const truck of trucks) {
      const sim = simulateTruck(truck.regNo);
      rows.push({ ...sim, make: truck.make, model: truck.model, status: truck.status });
      await ingestPing(tx, actor, {
        truckId: truck.id,
        regNo: truck.regNo,
        lat: sim.lat,
        lng: sim.lng,
        speedKmh: sim.speedKmh,
        route: sim.route,
      });
    }
    return rows;
  });
  return NextResponse.json({ positions, cities: CITIES, at: new Date().toISOString() });
}
