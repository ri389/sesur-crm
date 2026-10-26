CREATE TYPE "IntegrationDeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DELIVERED', 'DEAD');

CREATE TABLE "integration_delivery" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "IntegrationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(1000),
    "response_status" INTEGER,
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "integration_delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_attempt" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "error" VARCHAR(1000),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_attempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_delivery_idempotency_key_key" ON "integration_delivery"("idempotency_key");
CREATE INDEX "integration_delivery_status_next_attempt_at_created_at_idx" ON "integration_delivery"("status", "next_attempt_at", "created_at");
CREATE INDEX "integration_delivery_entity_type_entity_id_idx" ON "integration_delivery"("entity_type", "entity_id");
CREATE INDEX "integration_attempt_delivery_id_occurred_at_idx" ON "integration_attempt"("delivery_id", "occurred_at");

ALTER TABLE "integration_attempt" ADD CONSTRAINT "integration_attempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "integration_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
