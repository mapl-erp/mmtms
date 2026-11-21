import { decideLeaveAction } from "@/app/(ops)/actions";
import { Flash, Pill } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const rows = await withTenant(session.tid, async (tx) => {
    const requests = await tx.leaveRequest.findMany({ where: { tenantId: session.tid }, orderBy: { createdAt: "desc" } });
    const drivers = await tx.driver.findMany({ where: { tenantId: session.tid } });
    return { requests, drivers };
  });
  const name = new Map(rows.drivers.map((driver) => [driver.id, driver.name]));
  return (
    <>
      <p className="kicker">Attendance</p>
      <h1>Leave</h1>
      <p className="lede">Drivers apply from the phone. A manager approves here, and those days come out of the salary.</p>
      <Flash message={params.error} />
      <article className="panel section">
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Dates</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.requests.map((row) => (
              <tr key={row.id}>
                <td>{name.get(row.driverId) ?? "Driver"}</td>
                <td>
                  {fmtDate(row.startsOn)} – {fmtDate(row.endsOn)}
                </td>
                <td>{row.reason}</td>
                <td>
                  {row.status === "pending" ? (
                    <form action={decideLeaveAction}>
                      <input type="hidden" name="requestId" value={row.id} />
                      <button className="btn good" name="decision" value="approved" type="submit">
                        Approve
                      </button>
                      <button className="btn secondary" name="decision" value="rejected" type="submit">
                        Reject
                      </button>
                    </form>
                  ) : (
                    <Pill tone={row.status === "approved" ? "ok" : "bad"}>{row.status}</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}
