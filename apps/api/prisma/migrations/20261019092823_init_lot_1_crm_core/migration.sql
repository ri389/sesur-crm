-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "InteractionChannel" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "InteractionDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_client" BOOLEAN NOT NULL DEFAULT false,
    "became_customer_date" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "job_title" TEXT,
    "preferences" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AUTRE',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "assigned_user_id" UUID,
    "organization_id" UUID,
    "contact_id" UUID,
    "converted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction" (
    "id" UUID NOT NULL,
    "channel" "InteractionChannel" NOT NULL,
    "direction" "InteractionDirection" NOT NULL DEFAULT 'OUTBOUND',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "user_id" UUID,
    "lead_id" UUID,
    "contact_id" UUID,
    "organization_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_name_idx" ON "organization"("name");

-- CreateIndex
CREATE INDEX "organization_is_client_idx" ON "organization"("is_client");

-- CreateIndex
CREATE INDEX "contact_email_idx" ON "contact"("email");

-- CreateIndex
CREATE INDEX "contact_phone_idx" ON "contact"("phone");

-- CreateIndex
CREATE INDEX "contact_organization_id_idx" ON "contact"("organization_id");

-- CreateIndex
CREATE INDEX "lead_email_idx" ON "lead"("email");

-- CreateIndex
CREATE INDEX "lead_phone_idx" ON "lead"("phone");

-- CreateIndex
CREATE INDEX "lead_company_name_idx" ON "lead"("company_name");

-- CreateIndex
CREATE INDEX "lead_status_idx" ON "lead"("status");

-- CreateIndex
CREATE INDEX "lead_assigned_user_id_idx" ON "lead"("assigned_user_id");

-- CreateIndex
CREATE INDEX "interaction_lead_id_idx" ON "interaction"("lead_id");

-- CreateIndex
CREATE INDEX "interaction_contact_id_idx" ON "interaction"("contact_id");

-- CreateIndex
CREATE INDEX "interaction_organization_id_idx" ON "interaction"("organization_id");

-- CreateIndex
CREATE INDEX "interaction_occurred_at_idx" ON "interaction"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE INDEX "product_sku_idx" ON "product"("sku");

-- CreateIndex
CREATE INDEX "product_status_idx" ON "product"("status");

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
