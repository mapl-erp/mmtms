-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "aadhaar_enc" TEXT,
ADD COLUMN     "aadhaar_last4" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bank_account_enc" TEXT,
ADD COLUMN     "bank_ifsc_enc" TEXT,
ADD COLUMN     "bank_last4" TEXT,
ADD COLUMN     "biometric_consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "emergency_name" TEXT,
ADD COLUMN     "emergency_phone" TEXT,
ADD COLUMN     "medical_expiry" DATE,
ADD COLUMN     "pan_enc" TEXT,
ADD COLUMN     "pan_last4" TEXT,
ADD COLUMN     "police_verification" TEXT,
ADD COLUMN     "reference_notes" TEXT;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "pan" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "trucks" ADD COLUMN     "body_type" TEXT,
ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "depreciation_pct" DECIMAL(5,2),
ADD COLUMN     "financer" TEXT,
ADD COLUMN     "hire_terms" TEXT,
ADD COLUMN     "loan_emi" DECIMAL(12,2),
ADD COLUMN     "owner_party_id" UUID,
ADD COLUMN     "ownership_type" TEXT NOT NULL DEFAULT 'OWN',
ADD COLUMN     "purchase_cost" DECIMAL(14,2),
ADD COLUMN     "trailer_details" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "permission_overrides" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "truck_id" UUID NOT NULL,
    "trip_id" UUID,
    "doc_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "document_overrides_tenant_id_idx" ON "document_overrides"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_owner_party_id_fkey" FOREIGN KEY ("owner_party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_overrides" ADD CONSTRAINT "document_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_overrides" ADD CONSTRAINT "document_overrides_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_overrides" ADD CONSTRAINT "document_overrides_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;


UPDATE "parties" SET "tags" = ARRAY["kind"] WHERE cardinality("tags") = 0;

SELECT secure_tenant_table('branches');
SELECT secure_tenant_table('document_overrides');
