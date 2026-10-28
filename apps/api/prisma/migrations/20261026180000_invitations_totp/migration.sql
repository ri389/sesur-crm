ALTER TABLE "app_user"
    ADD COLUMN "totp_secret_encrypted" TEXT,
    ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "totp_enabled_at" TIMESTAMPTZ(3),
    ADD COLUMN "totp_last_counter" BIGINT;

CREATE TYPE "AuthChallengeType" AS ENUM ('ENROLL_TOTP', 'LOGIN_TOTP');

CREATE TABLE "auth_challenge" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AuthChallengeType" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_invitation" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    CONSTRAINT "user_invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_invitation_email_lowercase" CHECK ("email" = lower("email"))
);

CREATE UNIQUE INDEX "auth_challenge_token_hash_key" ON "auth_challenge"("token_hash");
CREATE INDEX "auth_challenge_user_id_expires_at_idx" ON "auth_challenge"("user_id", "expires_at");
CREATE UNIQUE INDEX "user_invitation_token_hash_key" ON "user_invitation"("token_hash");
CREATE INDEX "user_invitation_email_expires_at_idx" ON "user_invitation"("email", "expires_at");

ALTER TABLE "auth_challenge"
    ADD CONSTRAINT "auth_challenge_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invitation"
    ADD CONSTRAINT "user_invitation_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_invitation"
    ADD CONSTRAINT "user_invitation_invited_by_user_id_fkey"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
