import { savePartyAction } from "@/app/(ops)/actions";
import { Flash } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { inr, num } from "@/lib/format";
import { PARTY_TAG_LIST } from "@/lib/people";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Parties" };

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
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
      <p className="lede">One party master, tagged as customer, consignor, consignee, broker, attached owner, or vendor. The last quoted rate for a lane is the suggestion. Outstanding is the unpaid invoice total.</p>
      <Flash message={params.error} />
      <div className="split section">
      <div className="stack">
        {parties.map((party) => {
          const outstanding = party.invoices.reduce((sum, invoice) => sum + num(invoice.total), 0);
          return (
            <article key={party.id} className="panel">
              <header className="between">
                <h2>{party.name}</h2>
                <span>
                  {(party.tags.length ? party.tags : [party.kind]).join(" · ")} · {party.city}
                </span>
              </header>
              <p className="muted">
                {party.gstin ?? "No GSTIN"} · PAN {party.pan ?? "—"} · {party.phone ?? "No phone"} · outstanding {inr(outstanding)}
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
      <form className="panel form" action={savePartyAction}>
        <h2>Add a party</h2>
        <label>
          Name
          <input name="name" required />
        </label>
        <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 6 }}>
          <legend className="muted">Tags</legend>
          {PARTY_TAG_LIST.map((tag) => (
            <label key={tag}>
              <input type="checkbox" name="tags" value={tag} /> {tag.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <label>
          GSTIN
          <input name="gstin" />
        </label>
        <label>
          PAN
          <input name="pan" />
        </label>
        <label>
          Phone
          <input name="phone" />
        </label>
        <label>
          City
          <input name="city" />
        </label>
        <button className="btn" type="submit">
          Save party
        </button>
      </form>
      </div>
    </>
  );
}
