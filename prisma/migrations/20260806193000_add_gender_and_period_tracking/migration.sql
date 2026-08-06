-- Existing clients remain unchanged because gender is nullable.
CREATE TYPE "ClientGender" AS ENUM ('FEMALE', 'MALE', 'DIVERSE');

ALTER TABLE "ClientProfile"
ADD COLUMN "gender" "ClientGender";

CREATE TABLE "MenstrualCycleEntry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "flow" TEXT,
    "symptoms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenstrualCycleEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenstrualCycleEntry_clientId_startDate_key"
ON "MenstrualCycleEntry"("clientId", "startDate");

CREATE INDEX "MenstrualCycleEntry_clientId_startDate_idx"
ON "MenstrualCycleEntry"("clientId", "startDate");

ALTER TABLE "MenstrualCycleEntry"
ADD CONSTRAINT "MenstrualCycleEntry_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
