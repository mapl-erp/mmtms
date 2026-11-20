import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { requireSession } from "@/lib/session";

const NAV = [
  ["/desk", "Desk"],
  ["/fleet", "Fleet"],
  ["/drivers", "Drivers"],
  ["/parties", "Parties"],
  ["/trips", "Trips"],
  ["/map", "Map"],
  ["/fuel", "Fuel"],
  ["/workshop", "Workshop"],
  ["/billing", "Billing"],
  ["/evidence", "Evidence"],
  ["/team", "Team"],
] as const;

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.role === "DRIVER") redirect("/driver");
  const path = (await headers()).get("x-pathname") ?? "";
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark">MM</span>
          <div>
            <strong>Mighty Movers</strong>
            <small>
              {session.name} · {session.role.toLowerCase()}
            </small>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className={path.startsWith(href) ? "active" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <form action={logoutAction}>
          <button className="ghost" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
