CREATE TYPE "AuthMethod" AS ENUM ('TOTP', 'WHATSAPP');

ALTER TABLE "app_user"
    ADD COLUMN "auth_method" "AuthMethod" NOT NULL DEFAULT 'TOTP',
    ADD COLUMN "whatsapp_phone" TEXT,
    ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "whatsapp_enabled_at" TIMESTAMPTZ(3);

ALTER TABLE "auth_challenge"
    ADD COLUMN "code_hash" TEXT;

ALTER TYPE "AuthChallengeType" ADD VALUE 'ENROLL_WHATSAPP';
ALTER TYPE "AuthChallengeType" ADD VALUE 'LOGIN_WHATSAPP';
