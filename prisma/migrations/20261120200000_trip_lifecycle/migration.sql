-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "broker_party_id" UUID,
ADD COLUMN     "commission" DECIMAL(12,2),
ADD COLUMN     "distance_km" INTEGER,
ADD COLUMN     "eway_bill_no" TEXT,
ADD COLUMN     "eway_valid_until" TIMESTAMPTZ(3),
ADD COLUMN     "leg" TEXT,
ADD COLUMN     "load_weight_kg" INTEGER,
ADD COLUMN     "pod_seal_number" TEXT,
ADD COLUMN     "round_group_id" UUID,
ADD COLUMN     "shortage_note" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'OFFICE',
ADD COLUMN     "trip_type" TEXT NOT NULL DEFAULT 'SINGLE',
ADD COLUMN     "unload_weight_kg" INTEGER;

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "party_id" UUID,
    "place" TEXT NOT NULL,
    "goods" TEXT,
    "lr_number" TEXT,
    "seal_number" TEXT,
    "pol_done" BOOLEAN NOT NULL DEFAULT false,
    "pod_done" BOOLEAN NOT NULL DEFAULT false,
    "load_weight_kg" INTEGER,
    "unload_weight_kg" INTEGER,
    "shortage_note" TEXT,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_counters" (
    "tenant_id" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "series_counters_pkey" PRIMARY KEY ("tenant_id","series")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID,
    "driver_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payable" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "claimed_on" DATE NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "recipients" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "goods" TEXT NOT NULL,
    "weight_tons" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "trip_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_idx" ON "trip_stops"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_stops_trip_id_idx" ON "trip_stops"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stops_tenant_id_lr_number_key" ON "trip_stops"("tenant_id", "lr_number");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_trip_id_key" ON "settlements"("trip_id");

-- CreateIndex
CREATE INDEX "settlements_tenant_id_idx" ON "settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "expense_claims_tenant_id_idx" ON "expense_claims"("tenant_id");

-- CreateIndex
CREATE INDEX "alerts_tenant_id_idx" ON "alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_idx" ON "bookings"("tenant_id");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_broker_party_id_fkey" FOREIGN KEY ("broker_party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_counters" ADD CONSTRAINT "series_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


SELECT secure_tenant_table('trip_stops');
SELECT secure_tenant_table('series_counters');
SELECT secure_tenant_table('settlements');
SELECT secure_tenant_table('expense_claims');
SELECT secure_tenant_table('alerts');
SELECT secure_tenant_table('bookings');

CREATE OR REPLACE FUNCTION portal_track(p_slug text, p_lr text)
RETURNS TABLE (trip_number text, status text, origin text, destination text, truck text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.number, t.status, t.origin, t.destination, tr.reg_no
  FROM trips t
  JOIN tenants tn ON tn.id = t.tenant_id
  JOIN trucks tr ON tr.id = t.truck_id
  WHERE tn.slug = p_slug AND (
    t.lr_number = p_lr OR EXISTS (SELECT 1 FROM trip_stops s WHERE s.trip_id = t.id AND s.lr_number = p_lr)
  )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION portal_book(
  p_slug text, p_name text, p_phone text, p_origin text, p_destination text, p_goods text, p_weight numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tid uuid;
  bid uuid := gen_random_uuid();
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = p_slug;
  IF tid IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;
  INSERT INTO bookings (id, tenant_id, party_name, phone, origin, destination, goods, weight_tons, status)
  VALUES (bid, tid, p_name, p_phone, p_origin, p_destination, p_goods, p_weight, 'REQUESTED');
  RETURN bid;
END;
$$;

REVOKE ALL ON FUNCTION portal_track(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_track(text, text) TO mighty_app;
REVOKE ALL ON FUNCTION portal_book(text, text, text, text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_book(text, text, text, text, text, text, numeric) TO mighty_app;
