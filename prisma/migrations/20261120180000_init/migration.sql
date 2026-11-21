-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "driver_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dl_number" TEXT NOT NULL,
    "dl_expiry" DATE NOT NULL,
    "badge_number" TEXT,
    "badge_expiry" DATE,
    "monthly_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reg_no" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity_tons" DECIMAL(6,2) NOT NULL,
    "wheels" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "expected_kmpl" DECIMAL(5,2) NOT NULL,
    "odometer_km" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "expires_on" DATE NOT NULL,

    CONSTRAINT "truck_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT,
    "city" TEXT,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "truck_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "customer_id" UUID,
    "consignor_id" UUID,
    "consignee_id" UUID,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "goods" TEXT NOT NULL,
    "weight_tons" DECIMAL(10,2) NOT NULL,
    "rate_basis" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "freight" DECIMAL(12,2) NOT NULL,
    "lr_number" TEXT,
    "seal_number" TEXT,
    "pol_otp" TEXT,
    "pod_otp" TEXT,
    "pol_otp_ok" BOOLEAN NOT NULL DEFAULT false,
    "pod_otp_ok" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_id" UUID NOT NULL,
    "capture" TEXT NOT NULL,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_fills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "trip_id" UUID,
    "litres" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "odometer" INTEGER NOT NULL,
    "station" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "kmpl" DECIMAL(6,2),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_fills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_on" DATE,
    "due_km" INTEGER,
    "status" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendor" TEXT,

    CONSTRAINT "workshop_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tyres" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "km_run" INTEGER NOT NULL,

    CONSTRAINT "tyres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "trip_id" UUID,
    "party_id" UUID NOT NULL,
    "taxable" DECIMAL(12,2) NOT NULL,
    "gst_mode" TEXT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "gst_amount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "itc_eligible" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "trip_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" UUID,
    "payload" JSONB NOT NULL,
    "file_hashes" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_idx" ON "drivers"("tenant_id");

-- CreateIndex
CREATE INDEX "trucks_tenant_id_idx" ON "trucks"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_tenant_id_reg_no_key" ON "trucks"("tenant_id", "reg_no");

-- CreateIndex
CREATE INDEX "truck_documents_tenant_id_idx" ON "truck_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "truck_documents_truck_id_idx" ON "truck_documents"("truck_id");

-- CreateIndex
CREATE INDEX "parties_tenant_id_idx" ON "parties"("tenant_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_idx" ON "quotes"("tenant_id");

-- CreateIndex
CREATE INDEX "trips_tenant_id_idx" ON "trips"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_tenant_id_number_key" ON "trips"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "trips_tenant_id_lr_number_key" ON "trips"("tenant_id", "lr_number");

-- CreateIndex
CREATE INDEX "proofs_tenant_id_idx" ON "proofs"("tenant_id");

-- CreateIndex
CREATE INDEX "proofs_trip_id_idx" ON "proofs"("trip_id");

-- CreateIndex
CREATE INDEX "stored_files_tenant_id_idx" ON "stored_files"("tenant_id");

-- CreateIndex
CREATE INDEX "stored_files_tenant_id_sha256_idx" ON "stored_files"("tenant_id", "sha256");

-- CreateIndex
CREATE INDEX "fuel_fills_tenant_id_idx" ON "fuel_fills"("tenant_id");

-- CreateIndex
CREATE INDEX "workshop_jobs_tenant_id_idx" ON "workshop_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "tyres_tenant_id_idx" ON "tyres"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_number_key" ON "invoices"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_idx" ON "assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_events_tenant_id_idx" ON "ledger_events"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_events_tenant_id_seq_key" ON "ledger_events"("tenant_id", "seq");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_consignor_id_fkey" FOREIGN KEY ("consignor_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_consignee_id_fkey" FOREIGN KEY ("consignee_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_fills" ADD CONSTRAINT "fuel_fills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_fills" ADD CONSTRAINT "fuel_fills_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_fills" ADD CONSTRAINT "fuel_fills_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_jobs" ADD CONSTRAINT "workshop_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_jobs" ADD CONSTRAINT "workshop_jobs_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tyres" ADD CONSTRAINT "tyres_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tyres" ADD CONSTRAINT "tyres_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The runtime role is created by scripts/bootstrap-db.sh before migrate.
GRANT USAGE ON SCHEMA public TO mighty_app;

CREATE OR REPLACE FUNCTION secure_tenant_table(target text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
    target
  );
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO mighty_app', target);
END;
$$;

REVOKE ALL ON FUNCTION secure_tenant_table(text) FROM PUBLIC;

SELECT secure_tenant_table('users');
SELECT secure_tenant_table('drivers');
SELECT secure_tenant_table('trucks');
SELECT secure_tenant_table('truck_documents');
SELECT secure_tenant_table('parties');
SELECT secure_tenant_table('quotes');
SELECT secure_tenant_table('trips');
SELECT secure_tenant_table('proofs');
SELECT secure_tenant_table('stored_files');
SELECT secure_tenant_table('fuel_fills');
SELECT secure_tenant_table('workshop_jobs');
SELECT secure_tenant_table('tyres');
SELECT secure_tenant_table('invoices');
SELECT secure_tenant_table('assignments');
SELECT secure_tenant_table('ledger_events');

GRANT SELECT ON TABLE tenants TO mighty_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE tenants FROM mighty_app;

CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_events is append-only';
END;
$$;

REVOKE ALL ON FUNCTION ledger_append_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS ledger_no_mutation ON ledger_events;
CREATE TRIGGER ledger_no_mutation
BEFORE UPDATE OR DELETE ON ledger_events
FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

REVOKE UPDATE, DELETE ON TABLE ledger_events FROM mighty_app;

CREATE OR REPLACE FUNCTION app_login(p_slug text, p_email text)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  password_hash text,
  role text,
  name text,
  driver_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.password_hash, u.role, u.name, u.driver_id
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE t.slug = p_slug AND lower(u.email) = lower(p_email)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_login(text, text) TO mighty_app;
