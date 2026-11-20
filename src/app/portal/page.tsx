import { prisma } from "@/lib/db";

export const metadata = { title: "Track a load" };
export const dynamic = "force-dynamic";

type TrackRow = { trip_number: string; status: string; origin: string; destination: string; truck: string };

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; lr?: string; booked?: string; error?: string }>;
}) {
  const params = await searchParams;
  const workspace = params.workspace || "mighty-movers";
  const lr = params.lr?.trim();
  let track: TrackRow | null = null;
  if (lr) {
    const rows = await prisma.$queryRaw<TrackRow[]>`SELECT * FROM portal_track(${workspace}, ${lr})`;
    track = rows[0] ?? null;
  }
  return (
    <div className="login">
      <section className="login-story">
        <div>
          <p className="kicker">Customer portal</p>
          <h1>Book or track</h1>
          <p className="lede" style={{ color: "#d7c4a4" }}>
            The transporter still dispatches. A booking lands as a request. Tracking needs the lorry receipt number.
          </p>
        </div>
      </section>
      <section className="login-card">
        <div className="stack" style={{ width: "min(440px, 100%)" }}>
          <form className="panel form" action="/api/portal/book" method="post">
            <h2>Request a truck</h2>
            {params.booked ? <p className="intact">Request received.</p> : null}
            {params.error ? <p className="flash">{params.error}</p> : null}
            <input type="hidden" name="workspace" value={workspace} />
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Phone
              <input name="phone" required />
            </label>
            <label>
              From
              <input name="origin" required />
            </label>
            <label>
              To
              <input name="destination" required />
            </label>
            <label>
              Goods
              <input name="goods" required />
            </label>
            <label>
              Weight tonnes
              <input name="weightTons" type="number" step="0.1" min="0.1" required />
            </label>
            <button className="btn" type="submit">
              Send request
            </button>
          </form>
          <form className="panel form" method="get">
            <h2>Track</h2>
            <input type="hidden" name="workspace" value={workspace} />
            <label>
              LR number
              <input name="lr" defaultValue={lr ?? ""} placeholder="MM/26-27/0001" />
            </label>
            <button className="btn secondary" type="submit">
              Look up
            </button>
            {lr ? (
              track ? (
                <p>
                  {track.trip_number} is {track.status.replaceAll("_", " ").toLowerCase()}. {track.origin} → {track.destination}. Truck {track.truck}.
                </p>
              ) : (
                <p className="flash">No lorry receipt under that number.</p>
              )
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
