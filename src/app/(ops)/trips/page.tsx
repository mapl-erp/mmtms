import { createTripAction } from "@/app/(ops)/actions";
import { Flash } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Trips" };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const [trucks, drivers, parties, quotes] = await Promise.all([
      tx.truck.findMany({ where: { tenantId: session.tid }, orderBy: { regNo: "asc" } }),
      tx.driver.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } }),
      tx.party.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } }),
      tx.quote.findMany({ where: { tenantId: session.tid }, include: { party: true }, orderBy: { createdAt: "desc" }, take: 4 }),
    ]);
    return { trucks, drivers, parties, quotes };
  });
  return (
    <>
      <p className="kicker">Trips</p>
      <h1>Open a lorry receipt</h1>
      <p className="lede">The LR number is per workspace, MM-0001 onward. Status moves planned, loading, in transit, delivered, closed.</p>
      <Flash message={params.error} />
      <div className="split section">
        <form className="panel form" action={createTripAction}>
          <div className="grid2">
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
              Driver
              <select name="driverId">
                {data.drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer
              <select name="customerId">
                <option value="">—</option>
                {data.parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Consignor
              <select name="consignorId">
                <option value="">—</option>
                {data.parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Consignee
              <select name="consigneeId">
                <option value="">—</option>
                {data.parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rate basis
              <select name="rateBasis" defaultValue="FIXED">
                <option value="FIXED">Fixed per trip</option>
                <option value="PER_TONNE">Per tonne</option>
                <option value="PER_KM">Per km</option>
              </select>
            </label>
          </div>
          <div className="grid2">
            <label>
              From
              <input name="origin" required placeholder="Mumbai" />
            </label>
            <label>
              To
              <input name="destination" required placeholder="Pune" />
            </label>
            <label>
              Goods
              <input name="goods" required />
            </label>
            <label>
              Weight (t)
              <input name="weightTons" type="number" step="0.01" min="0.1" required />
            </label>
            <label>
              Rate (₹)
              <input name="rate" type="number" step="0.01" min="0" required />
            </label>
            <label>
              Distance km
              <input name="distanceKm" type="number" step="1" min="0" />
            </label>
          </div>
          <button className="btn" type="submit">
            Create trip
          </button>
        </form>
        <aside className="panel">
          <h2>Last quotes</h2>
          <table>
            <tbody>
              {data.quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    {quote.party.name}
                    <div className="muted">
                      {quote.origin} → {quote.destination}
                    </div>
                  </td>
                  <td>₹{Number(quote.amount).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>
    </>
  );
}
