import { DriverConsole } from "@/components/DriverConsole";
import { withTenant } from "@/lib/db";
import { logoutAction } from "@/app/login/actions";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Driver" };
export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const session = await requireSession();
  if (!session.driverId) {
    return (
      <div className="phone-page">
        <div className="phone">
          <header>
            <p className="kicker">Driver phone</p>
            <h1 style={{ fontSize: 32 }}>This login is the desk</h1>
          </header>
          <div className="body">
            <p>The phone opens for a driver account. The desk stays on the dispatcher login.</p>
            <form action={logoutAction}>
              <button className="btn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }
  const trip = await withTenant(session.tid, (tx) =>
    tx.trip.findFirst({
      where: {
        tenantId: session.tid,
        driverId: session.driverId!,
        status: { in: ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED"] },
      },
      include: { truck: true, proofs: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  );
  const dev = process.env.NODE_ENV !== "production";
  return (
    <div className="phone-page">
      <DriverConsole
        driverName={session.name}
        trip={
          trip
            ? {
                id: trip.id,
                number: trip.number,
                status: trip.status,
                origin: trip.origin,
                destination: trip.destination,
                goods: trip.goods,
                truck: trip.truck.regNo,
                sealNumber: trip.sealNumber,
                podOtpOk: trip.podOtpOk,
                devOtp: dev ? trip.podOtp : null,
                proofs: trip.proofs.map((proof) => ({ kind: proof.kind, capture: proof.capture })),
              }
            : null
        }
      />
    </div>
  );
}
