import { decideClaimAction, submitClaimAction } from "@/app/(ops)/actions";
import { Flash, Pill } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { CLAIM_CATEGORIES, payrollFor } from "@/lib/expenses";
import { inr, num } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const month = new Date().toISOString().slice(0, 7);
  const data = await withTenant(session.tid, async (tx) => {
    const claims = await tx.expenseClaim.findMany({
      where: { tenantId: session.tid },
      orderBy: { createdAt: "desc" },
    });
    const drivers = await tx.driver.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } });
    const trips = await tx.trip.findMany({ where: { tenantId: session.tid }, orderBy: { number: "desc" } });
    const payroll = [];
    for (const driver of drivers) payroll.push(await payrollFor(tx, session.tid, driver.id, month));
    return { claims, drivers, trips, payroll };
  });
  return (
    <>
      <p className="kicker">Settlement</p>
      <h1>Claims land in the month’s pay</h1>
      <p className="lede">
        Food is paid up to the daily cap. A manager approves the rest. Above the owner threshold the claim waits for the owner. Approved claims are added to attendance pay, after advances and deductions.
      </p>
      <Flash message={params.error} />
      <div className="split section">
        <article className="panel">
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Payable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.claims.map((claim) => (
                <tr key={claim.id}>
                  <td>
                    {claim.category}
                    <div className="muted">{claim.note}</div>
                  </td>
                  <td>
                    {inr(num(claim.payable))}
                    <div className="muted">of {inr(num(claim.amount))}</div>
                  </td>
                  <td>
                    {claim.status === "pending" || claim.status === "pending_owner" ? (
                      <form action={decideClaimAction}>
                        <input type="hidden" name="claimId" value={claim.id} />
                        <button className="btn good" name="decision" value="approved" type="submit">
                          Approve
                        </button>
                      </form>
                    ) : (
                      <Pill tone={claim.status === "approved" ? "ok" : "bad"}>{claim.status}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ marginTop: 18 }}>Payroll {month}</h2>
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Days</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {data.payroll.map((row) => (
                <tr key={row.driver}>
                  <td>{row.driver}</td>
                  <td>
                    {row.dutyDays}/{row.days}
                  </td>
                  <td>
                    {inr(row.net)}
                    <div className="muted">
                      pay {inr(row.salary)} + claims {inr(row.claims)} − advances {inr(row.advances)} − deductions {inr(row.deductions)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <form className="panel form" action={submitClaimAction}>
          <h2>New claim</h2>
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
            Trip
            <select name="tripId">
              <option value="">—</option>
              {data.trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select name="category">
              {CLAIM_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Amount ₹
            <input name="amount" type="number" min="1" step="0.01" required />
          </label>
          <label>
            Date
            <input name="claimedOn" type="date" required />
          </label>
          <label>
            Note
            <input name="note" placeholder="Receipt is tagged with GPS when the phone files it" />
          </label>
          <button className="btn" type="submit">
            Submit claim
          </button>
        </form>
      </div>
    </>
  );
}
