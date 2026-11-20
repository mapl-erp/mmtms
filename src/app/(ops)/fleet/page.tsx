import { Flash, Pill, Plate } from "@/components/ui";
import { registerDocumentAction, saveOwnershipAction } from "@/app/(ops)/actions";
import { withTenant } from "@/lib/db";
import { fmtDate, inr, num, titleCase } from "@/lib/format";
import { daysUntil, documentAlert, parseSettings } from "@/lib/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Fleet" };

const DOC_TYPES = ["RC", "FITNESS", "NATIONAL_PERMIT", "STATE_PERMIT", "INSURANCE", "PUC", "ROAD_TAX", "FASTAG", "AIS140"];

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const trucks = await withTenant(session.tid, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tid } });
    const rows = await tx.truck.findMany({
      where: { tenantId: session.tid },
      include: {
        documents: { orderBy: { expiresOn: "asc" } },
        ownerParty: true,
        branch: true,
        trips: true,
        fuels: true,
        jobs: true,
      },
      orderBy: { regNo: "asc" },
    });
    const parties = await tx.party.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } });
    return { settings: parseSettings(tenant.settings), rows, parties };
  });
  return (
    <>
      <p className="kicker">Fleet</p>
      <h1>Trucks and papers</h1>
      <p className="lede">RC, fitness, permits, insurance, PUC, tax, FASTag, and the AIS-140 certificate. Alerts fire at 30, 15, 7 days and on the expiry day.</p>
      <Flash message={params.error} />
      <div className="split section">
        <div className="stack">
          {trucks.rows.map((truck) => (
            <article key={truck.id} className="panel">
              <header className="between">
                <Plate>{truck.regNo}</Plate>
                <span className="muted">
                  {truck.make} {truck.model} · {num(truck.capacityTons)} t · {truck.odometerKm.toLocaleString("en-IN")} km · {truck.branch?.name ?? "No branch"}
                </span>
              </header>
              <p>
                {titleCase(truck.ownershipType)}
                {truck.ownerParty ? ` · ${truck.ownerParty.name}` : ""} · {truck.bodyType ?? "body not set"} · {truck.trailerDetails ?? "trailer not set"}
              </p>
              <p className="muted">
                Purchase {truck.purchaseCost ? inr(num(truck.purchaseCost)) : "—"} · depreciation {truck.depreciationPct ? `${num(truck.depreciationPct)}% a year` : "—"} · EMI {truck.loanEmi ? inr(num(truck.loanEmi)) : "—"} {truck.financer ?? ""}
              </p>
              <p className="muted">
                Freight {inr(truck.trips.reduce((sum, trip) => sum + num(trip.freight), 0))} · fuel {inr(truck.fuels.filter((fill) => fill.status === "approved").reduce((sum, fill) => sum + num(fill.amount), 0))} · workshop {inr(truck.jobs.reduce((sum, job) => sum + num(job.cost), 0))}
                {truck.hireTerms ? ` · hire: ${truck.hireTerms}` : ""}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Number</th>
                    <th>Expires</th>
                    <th>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {truck.documents.map((doc) => {
                    const days = daysUntil(doc.expiresOn);
                    const level = documentAlert(days, trucks.settings.docAlertDays);
                    const tone = level === "expired" ? "bad" : level ? "warn" : "ok";
                    return (
                      <tr key={doc.id}>
                        <td>{titleCase(doc.docType)}</td>
                        <td className="mono">{doc.docNumber}</td>
                        <td>{fmtDate(doc.expiresOn)}</td>
                        <td>
                          <Pill tone={tone}>
                            {level === "expired" ? "Expired" : level === "today" ? "Today" : level ? `${days}d` : "Valid"}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          ))}
        </div>
        <form className="panel form" action={registerDocumentAction}>
          <h2>File a document</h2>
          <label>
            Truck
            <select name="truckId">
              {trucks.rows.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.regNo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="docType">
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Number
            <input name="docNumber" required />
          </label>
          <label>
            Expires
            <input name="expiresOn" type="date" required />
          </label>
          <button className="btn" type="submit">
            File it
          </button>
        </form>
        <form className="panel form" action={saveOwnershipAction}>
          <h2>Ownership</h2>
          <label>
            Truck
            <select name="truckId">
              {trucks.rows.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.regNo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="ownershipType" defaultValue="OWN">
              <option value="OWN">Own</option>
              <option value="ATTACHED">Attached</option>
              <option value="MARKET">Market</option>
            </select>
          </label>
          <label>
            Owner party
            <select name="ownerPartyId">
              <option value="">—</option>
              {trucks.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hire terms
            <input name="hireTerms" placeholder="Per km or monthly, for attached and market" />
          </label>
          <div className="grid2">
            <label>
              Purchase ₹
              <input name="purchaseCost" type="number" step="1" />
            </label>
            <label>
              Depreciation %
              <input name="depreciationPct" type="number" step="0.1" />
            </label>
            <label>
              EMI ₹
              <input name="loanEmi" type="number" step="1" />
            </label>
            <label>
              Financer
              <input name="financer" />
            </label>
            <label>
              Body
              <input name="bodyType" placeholder="Container" />
            </label>
            <label>
              Trailer
              <input name="trailerDetails" placeholder="40 ft tri-axle" />
            </label>
          </div>
          <button className="btn" type="submit">
            Save ownership
          </button>
        </form>
      </div>
    </>
  );
}
