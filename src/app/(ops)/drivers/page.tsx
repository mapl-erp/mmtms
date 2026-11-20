import { saveDriverAction } from "@/app/(ops)/actions";
import { Flash, Pill } from "@/components/ui";
import { loadActor } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { fmtDate, fmtWhen, inr, num } from "@/lib/format";
import { presentDriver } from "@/lib/people";
import { daysUntil } from "@/lib/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Drivers" };

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const actor = await loadActor(tx, session);
    const drivers = await tx.driver.findMany({
      where: { tenantId: session.tid },
      include: { assignments: { include: { truck: true, trip: true }, orderBy: { startedAt: "desc" } } },
      orderBy: { name: "asc" },
    });
    return { actor, drivers };
  });
  return (
    <>
      <p className="kicker">Drivers</p>
      <h1>Licence, KYC, and who drove what</h1>
      <p className="lede">Aadhaar, PAN, and bank details are encrypted. The owner and the accountant see them. Everyone else sees the last four characters.</p>
      <Flash message={params.error} />
      <div className="stack section">
        {data.drivers.map((driver) => {
          const days = daysUntil(driver.dlExpiry);
          const secrets = presentDriver(data.actor, driver);
          return (
            <article key={driver.id} className="panel">
              <header className="between">
                <h2>{driver.name}</h2>
                <Pill tone={days < 30 ? "warn" : "ok"}>{days < 0 ? "DL expired" : `DL ${days}d`}</Pill>
              </header>
              <p className="muted">
                {driver.phone} · {driver.dlNumber} · badge {driver.badgeNumber ?? "—"} · {inr(num(driver.monthlySalary))}/month
              </p>
              <p>
                Aadhaar {secrets.aadhaar} · PAN {secrets.pan} · Bank {secrets.bankAccount} · IFSC {secrets.bankIfsc}
              </p>
              <p className="muted">
                {driver.address ?? "Address not filed"} · emergency {driver.emergencyName ?? "—"} {driver.emergencyPhone ?? ""} · medical{" "}
                {driver.medicalExpiry ? fmtDate(driver.medicalExpiry) : "—"} · consent{" "}
                {driver.biometricConsentAt ? "signed" : "not signed"}
              </p>
              <p className="muted">{driver.policeVerification ?? "Police verification not filed"}</p>
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
              <form action={saveDriverAction} className="form" style={{ marginTop: 12 }}>
                <input type="hidden" name="driverId" value={driver.id} />
                <div className="grid2">
                  <label>
                    Address
                    <input name="address" defaultValue={driver.address ?? ""} />
                  </label>
                  <label>
                    Medical fitness expires
                    <input name="medicalExpiry" type="date" />
                  </label>
                  <label>
                    Aadhaar
                    <input name="aadhaar" placeholder="Stored encrypted" autoComplete="off" />
                  </label>
                  <label>
                    PAN
                    <input name="pan" autoComplete="off" />
                  </label>
                  <label>
                    Bank account
                    <input name="bankAccount" autoComplete="off" />
                  </label>
                  <label>
                    IFSC
                    <input name="bankIfsc" autoComplete="off" />
                  </label>
                  <label>
                    Emergency name
                    <input name="emergencyName" defaultValue={driver.emergencyName ?? ""} />
                  </label>
                  <label>
                    Emergency phone
                    <input name="emergencyPhone" defaultValue={driver.emergencyPhone ?? ""} />
                  </label>
                </div>
                <label>
                  Police verification
                  <input name="policeVerification" defaultValue={driver.policeVerification ?? ""} />
                </label>
                <label>
                  References
                  <input name="referenceNotes" defaultValue={driver.referenceNotes ?? ""} />
                </label>
                <label>
                  <span>Biometric consent signed</span>
                  <input name="biometricConsent" type="checkbox" defaultChecked={Boolean(driver.biometricConsentAt)} />
                </label>
                <button className="btn" type="submit">
                  Save driver record
                </button>
              </form>
            </article>
          );
        })}
      </div>
    </>
  );
}
