# Mighty Movers TMS

Multi-tenant transport desk for Mighty Movers, a Pune fleet with two 16-wheeler 35-tonne trucks. The same database is shaped so another transporter can be a second tenant later.

Phase 1 is the running baseline: dispatch, driver phone, live map, lorry receipts, fuel, workshop, billing, and an append-only evidence ledger.

## Stack

- Next.js (App Router) and React
- Prisma and PostgreSQL
- The app connects as `mighty_app`, a role without `BYPASSRLS`
- Every tenant-owned table has `tenant_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and a policy that matches `app.tenant_id` set inside the request transaction
- Ledger rows are SHA-256 over the previous hash, the canonical JSON payload, and the sorted file hashes. A trigger rejects `UPDATE` and `DELETE`, and the app role is also revoked from those commands
- Proof photos are stored on disk and their SHA-256 is part of the ledger event
- PDF lorry receipts via `pdf-lib`. Evidence bundles are zip files
- The driver UI is a phone layout with a service worker, an IndexedDB offline queue, and camera capture. If the browser has no camera, the phone stamps a still and labels it

Sign-in is email and password for a workspace slug. Phone OTP and face check are named extension points and are not wired to a provider.

## Local database

PostgreSQL 16. The table owner (migrations and seed) must be a superuser so it can create the trigger. The running app must not be that role.

```bash
bash scripts/bootstrap-db.sh
cp .env.example .env   # then set SESSION_SECRET and FIELD_ENCRYPTION_KEY
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`scripts/bootstrap-db.sh` creates the database `mighty_movers` and the login role `mighty_app` (no superuser, no bypass RLS). The password it sets is `mighty-app-local`, matching `.env.example`. Point `MIGRATE_DATABASE_URL` at the local `postgres` superuser. That URL is only for migrate, seed, and the tamper test, which disables the ledger trigger, writes a bad payload, checks that verify fails, and restores the row.

`npm test` runs the Phase 1 suite against this database: hash chain, a real tampered row, a changed media file, row-level security, the trip lifecycle, and per-tenant LR numbers.

## Demo workspace

Workspace slug: `mighty-movers`

| Person | Role | Email | Password |
| --- | --- | --- | --- |
| Brij Pal | Owner | owner@mighty-movers.example | KwXNZFWPMsTM |
| Anil Joshi | Manager (desk) | manager@mighty-movers.example | LJm-fA1YXj07 |
| Kavita Shah | Accountant | accountant@mighty-movers.example | ya2vq4mYqZbR |
| Ramesh Pawar | Driver | ramesh@mighty-movers.example | kDetJt-ZSkSi |
| Suresh More | Driver | suresh@mighty-movers.example | hAMhGRlAAnVw |

The sign-in form is prefilled for the dispatcher. Suresh’s open duty is **TRP-1004**, Pune to Nashik: seal, load photo, and weighbridge slip on the phone, then the desk marks the trip in transit, then the consignee OTP and signature. In development the OTP is shown on the phone and printed in the server log. No SMS is sent.

Seeded fleet: **MH14MM3501** BharatBenz 3523 and **MH14MM3502** Tata Signa 3525. A GPS simulator moves both along the Mumbai–Pune and Pune–Nashik corridors. The map speed label is a road speed; the icon moves faster than that so the simulator is visible.

## GPS feed and the MQTT bridge

`src/lib/gps.ts` is the simulator the map polls. A later device feed should replace that function, not the page.

MQTT topics, if a broker is connected later:

- `mighty/{tenantSlug}/truck/{regNo}/position` with JSON `{ lat, lng, speedKmh, heading, ts, ignition }`
- `mighty/{tenantSlug}/truck/{regNo}/event` with JSON `{ type, ts }` where `type` is `tamper`, `power_cut`, or `signal_loss`

There is no broker in this build. Leave the simulator in place until `GPS_FEED=mqtt` and `MQTT_URL` are both set and a subscriber is added behind the same position shape.

## What the desk does in this phase

Fleet documents and expiry alerts (30, 15, 7 days, and the expiry day), drivers and assignment history, parties and last quotes, trips through planned, loading, in transit, delivered, and closed, LR PDFs, fuel approval with a km/l flag, workshop jobs and the tyre register, invoices at 5% without ITC or 18% with ITC, a Tally CSV, and an evidence zip per trip. The Evidence page recomputes the chain. “Preview a tampered copy” flips the latest payload in memory and does not write.

## Roadmap

Phase 2 was the hardware and government-portal work: on-board weighing, TPMS, alcohol interlock, driver-monitoring events, immobiliser commands, e-locks, and live ULIP, VAHAN, and e-way bill calls. The approved module spec pulls the device behaviour forward behind adapter interfaces and simulators. Live ULIP, VAHAN, and government e-way APIs stay out until credentials exist. Customers still generate the e-way bill; the desk records the number.

Phase 3 is the company’s own device, plus SaaS onboarding and subscription billing for other transporters. The schema is already one row per tenant. Creating the second tenant is a seed concern, not a billing product yet.
