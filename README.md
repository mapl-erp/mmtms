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

## Modules

The approved spec is in the app. These pieces are simulated rather than wired to a vendor:

- GPS positions come from the corridor simulator. Each ping still runs the tracking rules (deviation, stop, overspeed, geofence, tamper, power cut, signal loss) and writes alerts to the ledger.
- Zoho Books pushes return a simulated id until `ZOHO_ACCESS_TOKEN` and `ZOHO_ORG_ID` are set. Token setup is in DEPLOY.md. The Tally CSV stays available.
- Mail, WhatsApp LR shares, and the daily summary use SMTP or the WhatsApp Cloud API when those variables are set, and the outbox otherwise.
- Consignee OTP uses MSG91 when `MSG91_AUTH_KEY` is set. Otherwise it is shown on the driver phone in development and printed in the server log.
- Face match has a simulator so the check can run end to end. A vendor SDK is not connected.
- Immobiliser, e-lock, DMS, breath tests, J1939 faults, TPMS, and the six-camera recorder are adapter interfaces with simulators. Event clips are hashed into the ledger.
- ULIP, VAHAN, and the government e-way API are not called. The customer generates the e-way bill and the desk stores the number and its expiry.
- Subscription billing for other transporters is not built. A second tenant is another row behind the same RLS policies.

Thresholds (overspeed, stop time, food cap, owner-approval amount, fuel drop, km/l ratio, weight shortage, e-way warning, immobiliser speed, geofence) live on the tenant and are edited under Alerts.

`npm test` covers the hash chain, a real tampered ledger row, a changed media file, row-level security, the trip lifecycle, per-tenant financial-year LR numbers, encrypted KYC, the expired-document override, fuel theft, 18% GST with receipt matching, the immobiliser and e-lock rules, tracking alerts, breath-test failures, receipt-gated claims, leave pay, TPMS and J1939, retention sealing, the face simulator, and the cron secret.

## Roadmap still open

Hosting steps are in [DEPLOY.md](DEPLOY.md).

Live ULIP, VAHAN, and government e-way calls still need a government account. GPS, the immobiliser, the e-lock, DMS, TPMS, J1939, breath tests, and face match run on simulators until a device or provider is connected. Zoho, SMTP, WhatsApp, and MSG91 stay on the outbox or the on-screen OTP until their environment variables are set. SaaS subscription billing is not part of this build.
