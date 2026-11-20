import { Flash, Pill, Plate } from "@/components/ui";
import { registerDocumentAction } from "@/app/(ops)/actions";
import { withTenant } from "@/lib/db";
import { fmtDate, num, titleCase } from "@/lib/format";
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
      include: { documents: { orderBy: { expiresOn: "asc" } } },
      orderBy: { regNo: "asc" },
    });
    return { settings: parseSettings(tenant.settings), rows };
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
                  {truck.make} {truck.model} · {num(truck.capacityTons)} t · {truck.odometerKm.toLocaleString("en-IN")} km
                </span>
              </header>
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
      </div>
    </>
  );
}
