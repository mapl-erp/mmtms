import { decideFuelAction, recordFuelAction } from "@/app/(ops)/actions";
import { Flash, Pill, Plate } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { fmtWhen, inr, num } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Fuel" };

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const fills = await tx.fuelFill.findMany({
      where: { tenantId: session.tid },
      include: { truck: true },
      orderBy: { createdAt: "desc" },
    });
    const trucks = await tx.truck.findMany({ where: { tenantId: session.tid }, orderBy: { regNo: "asc" } });
    return { fills, trucks };
  });
  const canApprove = session.role === "OWNER" || session.role === "MANAGER";
  return (
    <>
      <p className="kicker">Fuel</p>
      <h1>Card or office UPI, then a km/l check</h1>
      <p className="lede">A fill is flagged when the kilometres per litre fall below the truck’s expected figure times the tenant shortfall ratio.</p>
      <Flash message={params.error} />
      <div className="split section">
        <article className="panel">
          <table>
            <thead>
              <tr>
                <th>Truck</th>
                <th>Station</th>
                <th>Litres</th>
                <th>km/l</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.fills.map((fill) => (
                <tr key={fill.id}>
                  <td>
                    <Plate>{fill.truck.regNo}</Plate>
                    <div className="muted">{fmtWhen(fill.createdAt)}</div>
                  </td>
                  <td>
                    {fill.station}
                    <div className="muted">{fill.method === "FLEET_CARD" ? "Fleet card" : "Office UPI"} · {inr(num(fill.amount))}</div>
                  </td>
                  <td>{num(fill.litres)}</td>
                  <td>
                    {fill.kmpl ? num(fill.kmpl).toFixed(2) : "—"}
                    {fill.flagged ? (
                      <div>
                        <Pill tone="bad">{fill.theftNote ?? `Short of ${num(fill.truck.expectedKmpl).toFixed(1)}`}</Pill>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Pill tone={fill.status === "approved" ? "ok" : fill.status === "rejected" ? "bad" : "warn"}>{fill.status}</Pill>
                  </td>
                  <td>
                    {canApprove && fill.status === "pending" ? (
                      <form action={decideFuelAction} className="form">
                        <input type="hidden" name="fillId" value={fill.id} />
                        <button className="btn good" name="decision" value="approved" type="submit">
                          Approve
                        </button>
                        <button className="btn secondary" name="decision" value="rejected" type="submit">
                          Reject
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <form className="panel form" action={recordFuelAction}>
          <h2>New fill</h2>
          <label>
            Truck
            <select name="truckId">
              {data.trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.regNo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Station
            <input name="station" required placeholder="IOCL Talegaon" />
          </label>
          <label>
            Litres
            <input name="litres" type="number" step="0.01" min="1" required />
          </label>
          <label>
            Amount ₹
            <input name="amount" type="number" step="0.01" min="1" required />
          </label>
          <label>
            Odometer
            <input name="odometer" type="number" min="1" required />
          </label>
          <label>
            Method
            <select name="method">
              <option value="FLEET_CARD">Fleet card</option>
              <option value="OFFICE_UPI">Office UPI</option>
            </select>
          </label>
          <button className="btn" type="submit">
            Send for approval
          </button>
        </form>
      </div>
    </>
  );
}
