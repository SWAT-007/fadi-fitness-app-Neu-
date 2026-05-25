-- Add auth state and legacy Supabase mapping fields for phase-1 migration safety.

CREATE TYPE "UserAuthState" AS ENUM ('ACTIVE', 'MIGRATED_PASSWORD_REQUIRED');

ALTER TABLE "User"
ADD COLUMN "authState" "UserAuthState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "legacySupabaseProfileId" TEXT;

ALTER TABLE "ClientProfile"
ADD COLUMN "legacySupabaseClientId" TEXT,
ADD COLUMN "legacySupabaseUserId" TEXT;

CREATE UNIQUE INDEX "User_legacySupabaseProfileId_key" ON "User"("legacySupabaseProfileId");
CREATE UNIQUE INDEX "ClientProfile_legacySupabaseClientId_key" ON "ClientProfile"("legacySupabaseClientId");
CREATE UNIQUE INDEX "ClientProfile_legacySupabaseUserId_key" ON "ClientProfile"("legacySupabaseUserId");
