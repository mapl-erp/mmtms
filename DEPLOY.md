# Host Mighty Movers

The app runs on Vercel with a managed Postgres database (Neon or Supabase). The runtime role cannot bypass row-level security. Migrations use a direct owner connection.

## 1. Database

Create a Postgres database and a role named `mighty_app` that is not a superuser and does not have `BYPASSRLS`.

```sql
CREATE ROLE mighty_app LOGIN PASSWORD 'choose-a-long-password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE your_database TO mighty_app;
GRANT USAGE ON SCHEMA public TO mighty_app;
```

On Neon, run that in the SQL editor as the project owner, then copy two connection strings:

- Pooled (host contains `-pooler`) for `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=1`.
- Direct (no pooler) for `DIRECT_URL`, using the owner role so Prisma can apply migrations.

On Supabase, use the transaction pooler string for `DATABASE_URL` with the same query string, and the direct session string for `DIRECT_URL`.

## 2. Environment

Copy `.env.example`. Set these before the first deploy:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled URL for `mighty_app` |
| `DIRECT_URL` | Direct owner URL for migrations |
| `SESSION_SECRET` | Signs the session cookie |
| `FIELD_ENCRYPTION_KEY` | Encrypts Aadhaar, PAN, and bank fields |
| `CRON_SECRET` | Vercel sends this as `Authorization: Bearer` on cron requests |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for photos, PDFs, clips, and the outbox |

`BLOB_READ_WRITE_TOKEN` can be replaced by `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Production refuses to write the local disk.

Optional integrations, each of which stays on a simulator or the outbox until it is set:

- `ZOHO_ORG_ID`, `ZOHO_ACCESS_TOKEN`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_SENDER`

## 3. Deploy

From the Vercel project, set the environment variables for Production, then:

```bash
npx prisma migrate deploy
OWNER_PASSWORD='a-long-password-you-keep-elsewhere' npx tsx prisma/seed-production.ts
```

`prisma migrate deploy` uses `DIRECT_URL`. The production seed creates the `mighty-movers` tenant and one owner user. It does not print the password, and a later run does not change an existing owner password.

`vercel.json` schedules two daily jobs, which fits the Hobby cron limit:

- `/api/cron/daily` at 02:00 UTC sends the summary, sweeps signal loss, and raises document-renewal alerts
- `/api/cron/retention` at 03:00 UTC copies records past the GST retention date into `archive_records` and object storage under `archive/`. Ledger rows are never deleted.

`/api/cron/sweep` is the same signal-loss sweep and can be called by hand with the cron secret. Live GPS pings from the map also run the tracking and driving-hour checks.

## 4. Phone

The driver app is `/driver`. The manifest and service worker are served with the site. On the Vercel HTTPS URL, add it to the home screen. Proof photos use the camera; if the phone has no camera, the page stamps a still and labels it.

## 5. Zoho Books token

1. Open the Zoho API console and create a Self Client.
2. Grant `ZohoBooks.invoices.CREATE` and `ZohoBooks.customerpayments.CREATE`.
3. Generate a grant token and exchange it for an access token.
4. Copy the Books organization id from the Zoho Books URL into `ZOHO_ORG_ID`, and the access token into `ZOHO_ACCESS_TOKEN`.

Until both are set, invoice and receipt pushes return a simulated id and the Tally CSV remains available.
