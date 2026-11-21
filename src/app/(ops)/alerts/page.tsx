import { saveThresholdsAction } from "@/app/(ops)/actions";
import { withTenant } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Alerts" };

const FIELDS: { name: string; label: string; step?: string }[] = [
  { name: "overspeedKmh", label: "Overspeed km/h" },
  { name: "unplannedStopMin", label: "Unplanned stop minutes" },
  { name: "foodDailyCapInr", label: "Food cap ₹ / day" },
  { name: "ownerApprovalAboveInr", label: "Owner approves above ₹" },
  { name: "fuelDropLitres", label: "Fuel drop litres" },
  { name: "kmplShortfallRatio", label: "km/l shortfall ratio", step: "0.01" },
  { name: "weightShortageKg", label: "Weight shortage kg" },
  { name: "ewayWarnHours", label: "E-way warning hours" },
];

export default async function AlertsPage() {
  const session = await requireSession();
  const settings = await withTenant(session.tid, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tid } });
    return parseSettings(tenant.settings);
  });
  return (
    <>
      <p className="kicker">Rules</p>
      <h1>Every threshold is a tenant setting</h1>
      <p className="lede">
        Overspeed, unplanned stops, document expiry, seal mismatch, and fuel theft notify the roles named in the rule. Night driving is not an alert. Tamper and power-cut also reach the owner.
      </p>
      <form className="panel form section" action={saveThresholdsAction} style={{ maxWidth: 520 }}>
        {FIELDS.map((field) => (
          <label key={field.name}>
            {field.label}
            <input name={field.name} type="number" step={field.step ?? "1"} defaultValue={String(settings[field.name as keyof typeof settings])} />
          </label>
        ))}
        <button className="btn" type="submit">
          Save thresholds
        </button>
      </form>
    </>
  );
}
