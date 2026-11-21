import { notFound } from "next/navigation";
import { advanceTripAction, deliveryFactsAction, settleTripAction, shareLrAction } from "@/app/(ops)/actions";
import { Flash, Pill, Plate } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { inr, num, titleCase } from "@/lib/format";
import { ewayWarning } from "@/lib/lifecycle";
import { parseSettings } from "@/lib/settings";
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
  const loaded = await withTenant(session.tid, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tid } });
    const trip = await tx.trip.findFirst({
      where: { id, tenantId: session.tid },
      include: {
        truck: true,
        driver: true,
        customer: true,
        consignor: true,
        consignee: true,
        stops: { orderBy: { seq: "asc" } },
        settlement: true,
        expenses: true,
        proofs: { include: { file: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const round = trip?.roundGroupId
      ? await tx.trip.findMany({ where: { tenantId: session.tid, roundGroupId: trip.roundGroupId }, include: { fuels: true, expenses: true } })
      : [];
    return { trip, settings: parseSettings(tenant.settings), round };
  });
  const trip = loaded.trip;
  if (!trip) notFound();
  const pol = polMissing(trip);
  const pod = podMissing(trip);
  const eway = ewayWarning(trip, loaded.settings);
  const profit = loaded.round.length
    ? loaded.round.reduce((sum, leg) => sum + num(leg.freight) - leg.fuels.filter((fill) => fill.status === "approved").reduce((inner, fill) => inner + num(fill.amount), 0) - leg.expenses.filter((claim) => claim.status === "approved").reduce((inner, claim) => inner + num(claim.payable), 0) - num(leg.commission), 0)
    : null;
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
      {eway ? <p className="flash">{eway}</p> : null}
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
            <p>
              Seal {trip.sealNumber ?? "not set"}
              {trip.podSealNumber ? ` · delivery seal ${trip.podSealNumber}` : ""}
              {trip.ewayBillNo ? ` · e-way ${trip.ewayBillNo}` : ""}
              {trip.tripType !== "SINGLE" ? ` · ${trip.tripType.toLowerCase()} ${trip.leg ?? ""}` : ""}
            </p>
            {profit != null ? <p>Round-trip profit {inr(profit)}</p> : null}
            {trip.stops.length > 0 ? (
              <ul>
                {trip.stops.map((stop) => (
                  <li key={stop.id}>
                    {stop.seq}. {stop.kind.toLowerCase()} {stop.place} · {stop.lrNumber}
                  </li>
                ))}
              </ul>
            ) : null}
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
            {["seal number", "load photo", "seal photo", "weighbridge slip", "consignor OTP or signature"].map((item) => (
              <div key={item} className="check">
                <span>{item}</span>
                <Pill tone={pol.includes(item) ? "warn" : "ok"}>{pol.includes(item) ? "Needed" : "Filed"}</Pill>
              </div>
            ))}
            <h2 style={{ marginTop: 16 }}>Proof of delivery</h2>
            {["seal-intact photo", "unloaded goods photo", "unloading weighbridge", "consignee OTP", "signature"].map((item) => (
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
            Close waits for the delivery proofs, a driver settlement, and no expense still pending. Settlement {trip.settlement ? inr(num(trip.settlement.amount)) : "not recorded"}.
          </p>
          {canDesk ? (
            <form action={settleTripAction} className="form" style={{ marginTop: 12 }}>
              <input type="hidden" name="tripId" value={trip.id} />
              <label>
                Settlement ₹
                <input name="amount" type="number" step="0.01" required />
              </label>
              <label>
                Note
                <input name="note" required />
              </label>
              <button className="btn secondary" type="submit">
                Record settlement
              </button>
            </form>
          ) : null}
          <form action={shareLrAction} className="form" style={{ marginTop: 12 }}>
            <input type="hidden" name="tripId" value={trip.id} />
            <label>
              Share LR to
              <input name="to" placeholder="email or WhatsApp number" />
            </label>
            <button className="btn secondary" name="channel" value="email" type="submit">
              Email PDF
            </button>
            <button className="btn secondary" name="channel" value="whatsapp" type="submit">
              WhatsApp PDF
            </button>
          </form>
          <form action={deliveryFactsAction} className="form" style={{ marginTop: 12 }}>
            <label>
              Delivery seal
              <input name="podSeal" defaultValue={trip.podSealNumber ?? ""} />
            </label>
            <label>
              Load weight kg
              <input name="loadWeightKg" type="number" defaultValue={trip.loadWeightKg ?? ""} />
            </label>
            <label>
              Unload weight kg
              <input name="unloadWeightKg" type="number" defaultValue={trip.unloadWeightKg ?? ""} />
            </label>
            <label>
              Shortage note
              <input name="shortageNote" defaultValue={trip.shortageNote ?? ""} />
            </label>
            <input type="hidden" name="tripId" value={trip.id} />
            <button className="btn secondary" type="submit">
              Save delivery facts
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
