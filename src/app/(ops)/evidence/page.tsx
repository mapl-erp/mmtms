import { previewTamperAction } from "@/app/(ops)/actions";
import { withTenant } from "@/lib/db";
import { fmtWhen } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { retentionUntil } from "@/lib/accounts";
import { fmtDate } from "@/lib/format";
import { verifyEvents, verifyTenant, type ChainRow } from "@/lib/verify";

export const metadata = { title: "Evidence" };

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const verified = await verifyTenant(tx, session.tid);
    const trips = await tx.trip.findMany({
      where: { tenantId: session.tid },
      orderBy: { number: "desc" },
      select: { id: true, number: true, lrNumber: true },
    });
    return { verified, trips };
  });
  let preview: { breaks: { seq: number; reason: string }[] } | null = null;
  if (params.preview === "1" && data.verified.events.length > 0) {
    const copy = structuredClone(data.verified.events) as ChainRow[];
    const last = copy[copy.length - 1];
    const payload = { ...(last.payload as Record<string, unknown>), tampered: true };
    last.payload = payload;
    preview = { breaks: verifyEvents(copy) };
  }
  return (
    <>
      <p className="kicker">Evidence</p>
      <h1>{data.verified.ok ? "Hash chain intact" : "Hash chain broken"}</h1>
      <p className="lede">
        Each row is SHA-256 of the previous hash, the canonical payload, and the file hashes. Postgres rejects update and delete on the ledger. This year’s bundle stays sealed until {fmtDate(retentionUntil())}.
      </p>
      <div className={data.verified.ok ? "intact section" : "break section"}>
        <strong>{data.verified.count} events</strong>
        <p>{data.verified.ok ? "Recomputed hashes match, and the media files still hash to the values in the chain." : data.verified.breaks.map((item) => `#${item.seq} ${item.reason}`).join(" · ")}</p>
      </div>
      {preview ? (
        <div className="break section">
          <strong>Tampered copy, not written</strong>
          <p>
            The latest payload was flipped in memory.{" "}
            {preview.breaks.length
              ? preview.breaks.map((item) => `#${item.seq} ${item.reason}`).join(" · ")
              : "The copy still verified, which should not happen."}
          </p>
        </div>
      ) : (
        <form action={previewTamperAction} className="section">
          <button className="btn secondary" type="submit">
            Preview a tampered copy
          </button>
        </form>
      )}
      <div className="split section">
        <article className="panel">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Event</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.verified.events.slice(-12).map((event) => (
                <tr key={event.seq}>
                  <td>{event.seq}</td>
                  <td>
                    {event.eventType}
                    <div className="muted">{event.createdAt ? fmtWhen(event.createdAt) : ""}</div>
                  </td>
                  <td className="hash">{event.hash.slice(0, 18)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="panel">
          <h2>Trip bundles</h2>
          <ul className="alerts">
            {data.trips.map((trip) => (
              <li key={trip.id}>
                <a href={`/api/trips/${trip.id}/evidence`}>
                  {trip.number} · {trip.lrNumber}
                </a>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </>
  );
}
