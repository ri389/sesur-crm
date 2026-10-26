-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "ticket" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "sla_response_due_at" TIMESTAMPTZ(3),
    "sla_resolution_due_at" TIMESTAMPTZ(3),
    "escalated_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "assigned_user_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "organization_id" UUID,
    "contact_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comment" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "value" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'XOF',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_number_key" ON "ticket"("number");

-- CreateIndex
CREATE INDEX "ticket_status_priority_created_at_idx" ON "ticket"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "ticket_assigned_user_id_status_idx" ON "ticket"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "ticket_sla_response_due_at_status_idx" ON "ticket"("sla_response_due_at", "status");

-- CreateIndex
CREATE INDEX "ticket_sla_resolution_due_at_status_idx" ON "ticket"("sla_resolution_due_at", "status");

-- CreateIndex
CREATE INDEX "ticket_organization_id_idx" ON "ticket"("organization_id");

-- CreateIndex
CREATE INDEX "ticket_contact_id_idx" ON "ticket"("contact_id");

-- CreateIndex
CREATE INDEX "ticket_comment_ticket_id_created_at_idx" ON "ticket_comment"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contract_number_key" ON "contract"("number");

-- CreateIndex
CREATE INDEX "contract_organization_id_status_idx" ON "contract"("organization_id", "status");

-- CreateIndex
CREATE INDEX "contract_expires_at_status_idx" ON "contract"("expires_at", "status");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
