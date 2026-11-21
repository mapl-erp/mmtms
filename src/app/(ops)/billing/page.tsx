import { createInvoiceAction, recordPaymentAction } from "@/app/(ops)/actions";
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
          <h1>18% GST, full ITC</h1>
          <p className="lede">Forward charge on freight. Purchases capture ITC. Zoho Books receives the invoice when a token is configured, and the Tally CSV stays as the fallback.</p>
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
                  <td>
                    {inr(num(invoice.total))}
                    <div className="muted">{invoice.booksMode === "zoho" ? invoice.externalId : invoice.externalId ? `${invoice.externalId} simulated` : ""}</div>
                  </td>
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
          <input type="hidden" name="gstMode" value="EIGHTEEN_ITC" />
          <p className="muted">GST is 18% with ITC on every new invoice.</p>
          <button className="btn" type="submit">
            Create invoice
          </button>
        </form>
        <form className="panel form" action={recordPaymentAction}>
          <h2>Receipt</h2>
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
            Match to invoice
            <select name="invoiceId">
              <option value="">Unallocated</option>
              {data.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number} · {invoice.party.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount ₹
            <input name="amount" type="number" min="1" step="0.01" required />
          </label>
          <label>
            Method
            <select name="method">
              <option value="NEFT">NEFT</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </label>
          <label>
            Reference
            <input name="reference" required />
          </label>
          <label>
            Received
            <input name="receivedOn" type="date" required />
          </label>
          <button className="btn" type="submit">
            Record receipt
          </button>
        </form>
      </div>
    </>
  );
}
