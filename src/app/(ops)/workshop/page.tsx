import { completeJobAction } from "@/app/(ops)/actions";
import { Pill, Plate } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { fmtDate, inr, num } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Workshop" };

export default async function WorkshopPage() {
  const session = await requireSession();
  const data = await withTenant(session.tid, async (tx) => {
    const jobs = await tx.workshopJob.findMany({
      where: { tenantId: session.tid },
      include: { truck: true },
      orderBy: { dueOn: "asc" },
    });
    const tyres = await tx.tyre.findMany({
      where: { tenantId: session.tid },
      include: { truck: true },
      orderBy: [{ truckId: "asc" }, { position: "asc" }],
    });
    return { jobs, tyres };
  });
  return (
    <>
      <p className="kicker">Workshop</p>
      <h1>Jobs and the tyre register</h1>
      <div className="split section">
        <article className="panel">
          <h2>Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Truck</th>
                <th>Job</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Plate>{job.truck.regNo}</Plate>
                  </td>
                  <td>
                    {job.title}
                    <div className="muted">
                      {job.vendor ?? "Own workshop"} · {inr(num(job.cost))}
                    </div>
                  </td>
                  <td>
                    {job.dueOn ? fmtDate(job.dueOn) : "—"}
                    {job.dueKm ? <div className="muted">{job.dueKm.toLocaleString("en-IN")} km</div> : null}
                  </td>
                  <td>
                    {job.status === "done" ? (
                      <Pill tone="ok">Done</Pill>
                    ) : (
                      <form action={completeJobAction}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <button className="btn secondary" type="submit">
                          Mark done
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Tyres</h2>
          <table>
            <thead>
              <tr>
                <th>Serial</th>
                <th>Position</th>
                <th>Km</th>
              </tr>
            </thead>
            <tbody>
              {data.tyres.map((tyre) => (
                <tr key={tyre.id}>
                  <td>
                    <span className="mono">{tyre.serial}</span>
                    <div className="muted">{tyre.truck.regNo}</div>
                  </td>
                  <td>{tyre.position}</td>
                  <td>{tyre.kmRun.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </>
  );
}
