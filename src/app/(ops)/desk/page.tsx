import { withTenant } from "@/lib/db";
import { num, titleCase } from "@/lib/format";
import { daysUntil, documentAlert, parseSettings } from "@/lib/settings";
import { requireSession } from "@/lib/session";
import { Pill, Plate } from "@/components/ui";

export const metadata = { title: "Desk" };

const COLUMNS = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CLOSED"] as const;

export default async function DeskPage() {
  const session = await requireSession();
  const data = await withTenant(session.tid, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tid } });
    const trucks = await tx.truck.findMany({
      where: { tenantId: session.tid },
      include: { documents: true },
      orderBy: { regNo: "asc" },
    });
    const trips = await tx.trip.findMany({
      where: { tenantId: session.tid },
      include: { driver: true, truck: true },
      orderBy: { number: "desc" },
    });
    const flagged = await tx.fuelFill.count({ where: { tenantId: session.tid, flagged: true } });
    return { settings: parseSettings(tenant.settings), trucks, trips, flagged };
  });
  const alerts = data.trucks.flatMap((truck) =>
    truck.documents.flatMap((doc) => {
      const days = daysUntil(doc.expiresOn);
      const level = documentAlert(days, data.settings.docAlertDays);
      if (!level) return [];
      const when = level === "expired" ? `${Math.abs(days)}d overdue` : level === "today" ? "expires today" : `${days}d left`;
      return [{ id: doc.id, truck: truck.regNo, type: doc.docType, when, level }];
    }),
  );

  return (
    <>
      <div className="row">
        <div>
          <p className="kicker">Dispatch</p>
          <h1>The board</h1>
          <p className="lede">BharatBenz and Tata Signa, both 16-wheeler 35-tonne. Document alerts sit above the trips.</p>
        </div>
        <div className="kpis">
          <div className="kpi">
            <b>{data.trucks.length}</b>
            <span>trucks</span>
          </div>
          <div className="kpi">
            <b>{data.trips.filter((trip) => trip.status === "IN_TRANSIT" || trip.status === "LOADING").length}</b>
            <span>open duties</span>
          </div>
          <div className="kpi">
            <b>{alerts.length}</b>
            <span>document alerts</span>
          </div>
          <div className="kpi">
            <b>{data.flagged}</b>
            <span>km/l flags</span>
          </div>
        </div>
      </div>
      {alerts.length > 0 ? (
        <ul className="alerts">
          {alerts.map((alert) => (
            <li key={alert.id} className={alert.level === "expired" ? "bad" : undefined}>
              <Plate>{alert.truck}</Plate> {titleCase(alert.type)} {alert.when}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="truck-row">
        {data.trucks.map((truck) => (
          <article key={truck.id} className="truck-card">
            <header>
              <Plate>{truck.regNo}</Plate>
              <Pill tone={truck.status === "in_transit" ? "info" : truck.status === "loading" ? "warn" : "ok"}>
                {titleCase(truck.status)}
              </Pill>
            </header>
            <h2>
              {truck.make} {truck.model}
            </h2>
            <p className="muted">
              {truck.wheels}-wheeler · {num(truck.capacityTons)} tonne · expected {num(truck.expectedKmpl).toFixed(1)} km/l
            </p>
          </article>
        ))}
      </div>
      <section className="section board">
        {COLUMNS.map((column) => {
          const trips = data.trips.filter((trip) => trip.status === column);
          return (
            <div key={column} className="column">
              <header>
                <strong>{titleCase(column)}</strong>
                <em>{trips.length}</em>
              </header>
              {trips.map((trip) => (
                <a key={trip.id} className="trip-card" href={`/trips/${trip.id}`}>
                  <strong>{trip.number}</strong>
                  <span>
                    {trip.origin} <span className="arrow">→</span> {trip.destination}
                  </span>
                  <span className="muted">
                    {trip.driver.name} · {trip.truck.regNo}
                  </span>
                  <span className="mono">{trip.lrNumber}</span>
                </a>
              ))}
            </div>
          );
        })}
      </section>
    </>
  );
}
