-- AlterTable
ALTER TABLE "expense_claims" ADD COLUMN     "captured_at" TIMESTAMPTZ(3),
ADD COLUMN     "receipt_file_id" UUID;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "drive_alert_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "drive_reminder_sent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tyres" ADD COLUMN     "pressure_kpa" DECIMAL(8,1),
ADD COLUMN     "temp_c" DECIMAL(5,1);

-- CreateTable
CREATE TABLE "tracker_states" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed_kmh" DOUBLE PRECISION NOT NULL,
    "ping_at" TIMESTAMPTZ(3) NOT NULL,
    "stopped_since" TIMESTAMPTZ(3),
    "stop_alerted" BOOLEAN NOT NULL DEFAULT false,
    "overspeed_alerted" BOOLEAN NOT NULL DEFAULT false,
    "deviation_alerted" BOOLEAN NOT NULL DEFAULT false,
    "zones" JSONB NOT NULL DEFAULT '[]',
    "tamper_open" BOOLEAN NOT NULL DEFAULT false,
    "power_cut_open" BOOLEAN NOT NULL DEFAULT false,
    "signal_lost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tracker_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breath_tests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "breath_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sealed_hash" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracker_states_truck_id_key" ON "tracker_states"("truck_id");

-- CreateIndex
CREATE INDEX "tracker_states_tenant_id_idx" ON "tracker_states"("tenant_id");

-- CreateIndex
CREATE INDEX "breath_tests_tenant_id_idx" ON "breath_tests"("tenant_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_idx" ON "leave_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "archive_records_tenant_id_idx" ON "archive_records"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "archive_records_tenant_id_source_table_source_id_key" ON "archive_records"("tenant_id", "source_table", "source_id");

-- AddForeignKey
ALTER TABLE "tracker_states" ADD CONSTRAINT "tracker_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breath_tests" ADD CONSTRAINT "breath_tests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breath_tests" ADD CONSTRAINT "breath_tests_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_records" ADD CONSTRAINT "archive_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT secure_tenant_table('tracker_states');
SELECT secure_tenant_table('breath_tests');
SELECT secure_tenant_table('leave_requests');
SELECT secure_tenant_table('archive_records');
