import { Pill } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { fmtDate, fmtWhen, inr, num } from "@/lib/format";
import { daysUntil } from "@/lib/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const session = await requireSession();
  const drivers = await withTenant(session.tid, (tx) =>
    tx.driver.findMany({
      where: { tenantId: session.tid },
      include: { assignments: { include: { truck: true, trip: true }, orderBy: { startedAt: "desc" } } },
      orderBy: { name: "asc" },
    }),
  );
  return (
    <>
      <p className="kicker">Drivers</p>
      <h1>Licence, badge, and who drove what</h1>
      <div className="split section">
        {drivers.map((driver) => {
          const days = daysUntil(driver.dlExpiry);
          return (
            <article key={driver.id} className="panel">
              <header className="between">
                <h2>{driver.name}</h2>
                <Pill tone={days < 30 ? "warn" : "ok"}>{days < 0 ? "DL expired" : `DL ${days}d`}</Pill>
              </header>
              <p className="muted">
                {driver.phone} · {driver.dlNumber} · badge {driver.badgeNumber ?? "—"} · {inr(num(driver.monthlySalary))}/month
              </p>
              <p>Licence expires {fmtDate(driver.dlExpiry)}</p>
              <table>
                <thead>
                  <tr>
                    <th>Truck</th>
                    <th>Trip</th>
                    <th>From</th>
                    <th>To</th>
                  </tr>
                </thead>
                <tbody>
                  {driver.assignments.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{row.truck.regNo}</td>
                      <td>{row.trip?.number ?? "—"}</td>
                      <td>{fmtWhen(row.startedAt)}</td>
                      <td>{row.endedAt ? fmtWhen(row.endedAt) : "On duty"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </>
  );
}
