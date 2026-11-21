import { dailySummaryAction } from "@/app/(ops)/actions";
import { retentionUntil } from "@/lib/accounts";
import { withTenant } from "@/lib/db";
import { fmtDate, inr, num } from "@/lib/format";
import { daysUntil, documentAlert, parseSettings } from "@/lib/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Reports" };

function ageBucket(createdAt: Date, now = new Date()) {
  const days = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
  if (days <= 30) return "0–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "90+";
}

export default async function ReportsPage() {
  const session = await requireSession();
  const data = await withTenant(session.tid, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tid } });
    const trucks = await tx.truck.findMany({
      where: { tenantId: session.tid },
      include: { trips: true, fuels: true, jobs: true, documents: true },
      orderBy: { regNo: "asc" },
    });
    const trips = await tx.trip.findMany({
      where: { tenantId: session.tid },
      include: { truck: true, fuels: true, expenses: true },
      orderBy: { number: "asc" },
    });
    const drivers = await tx.driver.findMany({ where: { tenantId: session.tid }, include: { assignments: true }, orderBy: { name: "asc" } });
    const invoices = await tx.invoice.findMany({ where: { tenantId: session.tid }, include: { party: true, allocations: true, trip: true } });
    const purchases = await tx.purchase.findMany({ where: { tenantId: session.tid } });
    const claims = await tx.expenseClaim.findMany({ where: { tenantId: session.tid } });
    const alerts = await tx.alert.findMany({ where: { tenantId: session.tid } });
    const jobs = await tx.workshopJob.findMany({ where: { tenantId: session.tid, status: { not: "done" } }, include: { truck: true } });
    const mails = await tx.outboxMail.findMany({ where: { tenantId: session.tid }, orderBy: { createdAt: "desc" }, take: 3 });
    return { settings: parseSettings(tenant.settings), trucks, trips, drivers, invoices, purchases, claims, alerts, jobs, mails };
  });
  const ageing = new Map<string, number>();
  for (const invoice of data.invoices) {
    const open = num(invoice.total) - invoice.allocations.reduce((sum, row) => sum + num(row.amount), 0);
    if (open <= 0) continue;
    const bucket = ageBucket(invoice.createdAt);
    ageing.set(bucket, (ageing.get(bucket) ?? 0) + open);
  }
  return (
    <>
      <div className="row">
        <div>
          <p className="kicker">Reports</p>
          <h1>The six registers</h1>
          <p className="lede">Profit, fuel, drivers, ageing, GST, and what expires next. The daily note is written to the outbox until an SMTP server is configured.</p>
        </div>
        <form action={dailySummaryAction}>
          <button className="btn" type="submit">
            Send today’s summary
          </button>
        </form>
      </div>
      <p className="muted section">Current-year records stay sealed until {fmtDate(retentionUntil())}, six years after the GSTR-9 due date.</p>
      <div className="stack section">
        <article className="panel">
          <h2>Profit per truck and trip</h2>
          <table>
            <thead>
              <tr>
                <th>Truck</th>
                <th>Freight</th>
                <th>Fuel</th>
                <th>Workshop</th>
              </tr>
            </thead>
            <tbody>
              {data.trucks.map((truck) => (
                <tr key={truck.id}>
                  <td className="mono">{truck.regNo}</td>
                  <td>{inr(truck.trips.reduce((sum, trip) => sum + num(trip.freight), 0))}</td>
                  <td>{inr(truck.fuels.filter((fill) => fill.status === "approved").reduce((sum, fill) => sum + num(fill.amount), 0))}</td>
                  <td>{inr(truck.jobs.reduce((sum, job) => sum + num(job.cost), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Fuel and mileage</h2>
          <table>
            <tbody>
              {data.trucks.map((truck) => {
                const fills = truck.fuels.filter((fill) => fill.kmpl);
                const avg = fills.length ? fills.reduce((sum, fill) => sum + num(fill.kmpl), 0) / fills.length : 0;
                return (
                  <tr key={truck.id}>
                    <td className="mono">{truck.regNo}</td>
                    <td>{fills.length ? `${avg.toFixed(2)} km/l` : "No measured fill"}</td>
                    <td>{truck.fuels.filter((fill) => fill.flagged).length} flagged</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Driver scorecard</h2>
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Duties</th>
                <th>Claims</th>
                <th>Safety alerts</th>
              </tr>
            </thead>
            <tbody>
              {data.drivers.map((driver) => (
                <tr key={driver.id}>
                  <td>{driver.name}</td>
                  <td>{driver.assignments.length}</td>
                  <td>{data.claims.filter((claim) => claim.driverId === driver.id && claim.status === "approved").length}</td>
                  <td>{data.alerts.filter((alert) => alert.entityId === driver.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Receivables ageing</h2>
          <table>
            <tbody>
              {["0–30", "31–60", "61–90", "90+"].map((bucket) => (
                <tr key={bucket}>
                  <td>{bucket} days</td>
                  <td>{inr(ageing.get(bucket) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Payables in approved claims {inr(data.claims.filter((claim) => claim.status === "approved").reduce((sum, claim) => sum + num(claim.payable), 0))}.</p>
        </article>
        <article className="panel">
          <h2>GST and trip register</h2>
          <p>
            Output GST {inr(data.invoices.reduce((sum, invoice) => sum + num(invoice.gstAmount), 0))} · ITC {inr(data.purchases.reduce((sum, purchase) => sum + num(purchase.itcAmount), 0))}
          </p>
          <table>
            <tbody>
              {data.trips.map((trip) => (
                <tr key={trip.id}>
                  <td className="mono">{trip.lrNumber}</td>
                  <td>{trip.number}</td>
                  <td>
                    {trip.origin} → {trip.destination}
                  </td>
                  <td>{inr(num(trip.freight))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Documents and maintenance due</h2>
          <ul className="alerts">
            {data.trucks.flatMap((truck) =>
              truck.documents
                .filter((doc) => documentAlert(daysUntil(doc.expiresOn), data.settings.docAlertDays))
                .map((doc) => (
                  <li key={doc.id}>
                    {truck.regNo} {doc.docType} {fmtDate(doc.expiresOn)}
                  </li>
                )),
            )}
            {data.jobs.map((job) => (
              <li key={job.id}>
                {job.truck.regNo} {job.title}
                {job.dueOn ? ` · ${fmtDate(job.dueOn)}` : ""}
              </li>
            ))}
          </ul>
        </article>
        {data.mails[0] ? (
          <article className="panel">
            <h2>{data.mails[0].subject}</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{data.mails[0].body}</pre>
          </article>
        ) : null}
      </div>
    </>
  );
}
