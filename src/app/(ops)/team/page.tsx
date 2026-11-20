import { savePermissionsAction } from "@/app/(ops)/actions";
import { Flash, Pill } from "@/components/ui";
import { loadActor, parseOverrides } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const data = await withTenant(session.tid, async (tx) => {
    const actor = await loadActor(tx, session);
    const users = await tx.user.findMany({
      where: { tenantId: session.tid },
      include: { branch: true },
      orderBy: { name: "asc" },
    });
    const branches = await tx.branch.findMany({ where: { tenantId: session.tid }, orderBy: { name: "asc" } });
    return { actor, users, branches };
  });
  return (
    <>
      <p className="kicker">Company</p>
      <h1>Roles, and the exceptions</h1>
      <p className="lede">
        Owner, manager, accountant, and driver are fixed. The owner can grant or revoke a single permission on top of the role. One office is open now; the branch column is ready for the next one.
      </p>
      <Flash message={params.error} />
      <article className="panel section">
        <p className="muted">Branches: {data.branches.map((branch) => `${branch.name} (${branch.code})`).join(", ") || "None yet"}</p>
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Overrides</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => {
              const overrides = parseOverrides(user.permissionOverrides);
              return (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    <div className="muted">{user.email}</div>
                  </td>
                  <td>
                    <Pill>{user.role.toLowerCase()}</Pill>
                  </td>
                  <td>{user.branch?.name ?? "—"}</td>
                  <td>
                    {data.actor.role === "OWNER" ? (
                      <form action={savePermissionsAction} className="form">
                        <input type="hidden" name="userId" value={user.id} />
                        <label>
                          Grant
                          <input name="grant" defaultValue={(overrides.grant ?? []).join(", ")} placeholder="billing.manage" />
                        </label>
                        <label>
                          Revoke
                          <input name="revoke" defaultValue={(overrides.revoke ?? []).join(", ")} placeholder="fuel.approve" />
                        </label>
                        <button className="btn secondary" type="submit">
                          Save overrides
                        </button>
                      </form>
                    ) : (
                      <span className="muted">
                        grant {(overrides.grant ?? []).join(", ") || "—"} · revoke {(overrides.revoke ?? []).join(", ") || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </>
  );
}
