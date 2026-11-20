import { notFound } from "next/navigation";
import { advanceTripAction } from "@/app/(ops)/actions";
import { Flash, Pill, Plate } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { inr, num, titleCase } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { podMissing, polMissing } from "@/lib/trips";

export const metadata = { title: "Trip" };

const STEPS = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CLOSED"];
const ADVANCE: Record<string, string> = {
  PLANNED: "Start loading",
  LOADING: "Mark in transit",
  IN_TRANSIT: "Mark delivered",
  DELIVERED: "Close trip",
};

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const trip = await withTenant(session.tid, (tx) =>
    tx.trip.findFirst({
      where: { id, tenantId: session.tid },
      include: {
        truck: true,
        driver: true,
        customer: true,
        consignor: true,
        consignee: true,
        proofs: { include: { file: true }, orderBy: { createdAt: "asc" } },
      },
    }),
  );
  if (!trip) notFound();
  const pol = polMissing(trip);
  const pod = podMissing(trip);
  const canDesk = session.role === "OWNER" || session.role === "MANAGER";
  return (
    <>
      <p className="kicker">{trip.lrNumber}</p>
      <div className="row">
        <h1>
          {trip.origin} <span className="arrow">→</span> {trip.destination}
        </h1>
        <Plate>{trip.truck.regNo}</Plate>
      </div>
      <div className="stepper">
        {STEPS.map((step) => (
          <span key={step} className={step === trip.status ? "on" : undefined}>
            {titleCase(step)}
          </span>
        ))}
      </div>
      <Flash message={query.error} />
      <div className="split section">
        <div className="stack">
          <article className="panel">
            <h2>
              {trip.number} · {trip.goods}
            </h2>
            <p>
              {trip.driver.name} · {num(trip.weightTons)} t · {inr(num(trip.freight))} · {titleCase(trip.rateBasis)}
            </p>
            <p className="muted">
              Consignor {trip.consignor?.name ?? "—"} · Consignee {trip.consignee?.name ?? "—"} · Customer {trip.customer?.name ?? "—"}
            </p>
            <p>Seal {trip.sealNumber ?? "not set"}</p>
            <p>
              <a className="btn secondary" href={`/api/trips/${trip.id}/lr`}>
                LR PDF
              </a>{" "}
              <a className="btn secondary" href={`/api/trips/${trip.id}/evidence`}>
                Evidence zip
              </a>
            </p>
          </article>
          <article className="panel">
            <h2>Proof of loading</h2>
            {["seal number", "load photo", "weighbridge slip"].map((item) => (
              <div key={item} className="check">
                <span>{item}</span>
                <Pill tone={pol.includes(item) ? "warn" : "ok"}>{pol.includes(item) ? "Needed" : "Filed"}</Pill>
              </div>
            ))}
            <h2 style={{ marginTop: 16 }}>Proof of delivery</h2>
            {["consignee OTP", "signature"].map((item) => (
              <div key={item} className="check">
                <span>{item}</span>
                <Pill tone={pod.includes(item) ? "warn" : "ok"}>{pod.includes(item) ? "Needed" : "Filed"}</Pill>
              </div>
            ))}
          </article>
          <article className="panel">
            <h2>Photos</h2>
            <div className="proofs">
              {trip.proofs.map((proof) => (
                <figure key={proof.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${proof.fileId}`} alt={proof.kind} />
                  <figcaption>
                    {titleCase(proof.kind)} · {proof.capture === "stamped_still" ? "stamped still" : "camera"}
                  </figcaption>
                </figure>
              ))}
            </div>
          </article>
        </div>
        <aside className="panel">
          <h2>Dispatch</h2>
          {canDesk && ADVANCE[trip.status] ? (
            <form action={advanceTripAction} className="form">
              <input type="hidden" name="tripId" value={trip.id} />
              <button className="btn" type="submit">
                {ADVANCE[trip.status]}
              </button>
            </form>
          ) : (
            <p className="muted">This trip is closed.</p>
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            Suresh files seal, load photo, and weighbridge on the phone. After you mark the trip in transit, the consignee OTP is printed in the server log and shown on his phone.
          </p>
        </aside>
      </div>
    </>
  );
}
