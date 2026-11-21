import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="login">
      <section className="login-story">
        <div>
          <p className="kicker">Pune · 35 tonne</p>
          <h1>Mighty Movers</h1>
          <p className="lede" style={{ color: "#d7c4a4" }}>
            Two 16-wheelers, one desk. Trips, lorry receipts, fuel, and the hash-chain ledger live in this workspace.
          </p>
        </div>
        <p>Password is the active sign-in. Phone OTP and face check stay unplugged until a provider is connected.</p>
      </section>
      <section className="login-card">
        <form className="form panel" action={loginAction}>
          <p className="kicker">Sign in</p>
          <h2>Dispatcher desk</h2>
          {params.error ? <p className="flash">Workspace, email, or password did not match.</p> : null}
          <label>
            Workspace
            <input name="workspace" defaultValue="mighty-movers" autoComplete="organization" required />
          </label>
          <label>
            Email
            <input name="email" type="email" defaultValue="manager@mighty-movers.example" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn" type="submit">
            Open the desk
          </button>
        </form>
      </section>
    </div>
  );
}
