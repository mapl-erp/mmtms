import { withTenant } from "@/lib/db";
import { inr, num, titleCase } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Parties" };

export default async function PartiesPage() {
  const session = await requireSession();
  const parties = await withTenant(session.tid, (tx) =>
    tx.party.findMany({
      where: { tenantId: session.tid },
      include: { quotes: { orderBy: { createdAt: "desc" } }, invoices: true },
      orderBy: { name: "asc" },
    }),
  );
  return (
    <>
      <p className="kicker">Parties and quotes</p>
      <h1>Who we carry for</h1>
      <p className="lede">The last quoted rate for a party and lane is the suggestion. There is no rate card.</p>
      <div className="stack section">
        {parties.map((party) => {
          const outstanding = party.invoices.reduce((sum, invoice) => sum + num(invoice.total), 0);
          return (
            <article key={party.id} className="panel">
              <header className="between">
                <h2>{party.name}</h2>
                <span>
                  {titleCase(party.kind)} · {party.city}
                </span>
              </header>
              <p className="muted">
                {party.gstin ?? "No GSTIN"} · {party.phone ?? "No phone"} · outstanding {inr(outstanding)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Quote</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {party.quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        {quote.origin} → {quote.destination}
                      </td>
                      <td>{inr(num(quote.amount))}</td>
                      <td>{quote.note ?? "—"}</td>
                    </tr>
                  ))}
                  {party.quotes.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No quote yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </>
  );
}
