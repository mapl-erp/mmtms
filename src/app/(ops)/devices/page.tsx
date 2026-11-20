import { immobiliseAction, unlockAction, dmsAction, clipAction } from "@/app/(ops)/device-actions";
import { Flash, Pill } from "@/components/ui";
import { CAMERAS } from "@/lib/devices";
import { withTenant } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { simulateTruck } from "@/lib/gps";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Devices" };

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const devices = await withTenant(session.tid, (tx) =>
    tx.device.findMany({
      where: { tenantId: session.tid },
      include: { truck: true, logs: { orderBy: { createdAt: "desc" }, take: 3 } },
      orderBy: { serial: "asc" },
    }),
  );
  return (
    <>
      <p className="kicker">Hardware</p>
      <h1>Certified devices, simulated for now</h1>
      <p className="lede">
        GPS, the 8-channel recorder, the driver monitor, the cargo e-lock, and the immobiliser sit behind adapter interfaces. The commands below call the simulators. A custom device can replace an adapter later without changing the desk.
      </p>
      <Flash message={params.error} />
      <div className="stack section">
        {devices.map((device) => {
          const speed = device.truck ? simulateTruck(device.truck.regNo).speedKmh : 0;
          return (
            <article key={device.id} className="panel">
              <header className="between">
                <h2>
                  {device.kind} · {device.serial}
                </h2>
                <Pill tone={device.status === "online" ? "ok" : "bad"}>{device.status}</Pill>
              </header>
              <p className="muted">
                {device.vendor} · firmware {device.firmware}
                {device.truck ? ` · ${device.truck.regNo}` : ""}
                {device.simNumber ? ` · SIM ${device.simNumber}` : ""}
                {device.warrantyUntil ? ` · warranty ${fmtDate(device.warrantyUntil)}` : ""}
                {device.ais140Until ? ` · AIS-140 ${fmtDate(device.ais140Until)}` : ""}
                {(device.config as { otp?: string }).otp ? ` · delivery OTP ${(device.config as { otp?: string }).otp}` : ""}
              </p>
              {device.kind === "IMMOBILISER" ? (
                <form action={immobiliseAction} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <input type="hidden" name="speedKmh" value={speed} />
                  <p>Live simulator speed {speed} km/h. Cut-off is refused above the tenant limit.</p>
                  <label>
                    Reason
                    <input name="reason" required placeholder="Who asked, and why" />
                  </label>
                  <button className="btn bad" type="submit">
                    Cut engine
                  </button>
                </form>
              ) : null}
              {device.kind === "ELOCK" ? (
                <form action={unlockAction} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <label>
                    OTP
                    <input name="otp" required />
                  </label>
                  <label>
                    Latitude
                    <input name="lat" defaultValue="19.997" />
                  </label>
                  <label>
                    Longitude
                    <input name="lng" defaultValue="73.789" />
                  </label>
                  <button className="btn" type="submit">
                    Unlock at delivery
                  </button>
                </form>
              ) : null}
              {device.kind === "DMS" ? (
                <form action={dmsAction} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <label>
                    Event
                    <select name="kind">
                      <option value="drowsiness">Drowsiness</option>
                      <option value="phone">Phone</option>
                      <option value="smoking">Smoking</option>
                    </select>
                  </label>
                  <button className="btn secondary" type="submit">
                    Inject monitor event
                  </button>
                </form>
              ) : null}
              {device.kind === "MDVR" ? (
                <form action={clipAction} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <label>
                    Camera
                    <select name="camera">
                      {CAMERAS.map((camera) => (
                        <option key={camera}>{camera}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn secondary" type="submit">
                    Hash an event clip
                  </button>
                </form>
              ) : null}
              {device.logs.length > 0 ? (
                <ul>
                  {device.logs.map((log) => (
                    <li key={log.id}>
                      {log.action}: {log.note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
