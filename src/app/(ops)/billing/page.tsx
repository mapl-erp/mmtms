import { createInvoiceAction } from "@/app/(ops)/actions";
import { Flash, Pill } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { fmtDate, inr, num } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { tenantId: session.tid },
      include: { party: true, trip: true },
      orderBy: { createdAt: "desc" },
    });
    const parties = await tx.party.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } });
    const trips = await tx.trip.findMany({ where: { tenantId: session.tid }, orderBy: { number: "desc" } });
    return { invoices, parties, trips };
  });
  return (
    <>
      <div className="row">
        <div>
          <p className="kicker">Billing</p>
          <h1>5% without ITC, or 18% with it</h1>
          <p className="lede">Tally takes the CSV. The voucher list is the same set of invoices.</p>
        </div>
        <a className="btn" href="/api/billing/tally">
          Download Tally CSV
        </a>
      </div>
      <Flash message={params.error} />
      <div className="split section">
        <article className="panel">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Party</th>
                <th>GST</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <span className="mono">{invoice.number}</span>
                    <div className="muted">
                      {fmtDate(invoice.createdAt)} · {invoice.trip?.number ?? "No trip"}
                    </div>
                  </td>
                  <td>{invoice.party.name}</td>
                  <td>
                    {num(invoice.gstRate)}%
                    <div>
                      <Pill tone={invoice.itcEligible ? "ok" : "warn"}>{invoice.itcEligible ? "ITC" : "No ITC"}</Pill>
                    </div>
                  </td>
                  <td>{inr(num(invoice.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <form className="panel form" action={createInvoiceAction}>
          <h2>Raise an invoice</h2>
          <label>
            Party
            <select name="partyId">
              {data.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
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
            Taxable ₹
            <input name="taxable" type="number" min="1" step="0.01" required />
          </label>
          <label>
            GST
            <select name="gstMode" defaultValue="EIGHTEEN_ITC">
              <option value="EIGHTEEN_ITC">18% with ITC</option>
              <option value="FIVE_NO_ITC">5% without ITC</option>
            </select>
          </label>
          <button className="btn" type="submit">
            Create invoice
          </button>
        </form>
      </div>
    </>
  );
}
