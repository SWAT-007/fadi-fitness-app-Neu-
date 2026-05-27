-- CreateTable
CREATE TABLE "ProgressLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "bodyWeight" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseProgressLogId" TEXT,

    CONSTRAINT "ProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCheckin" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "mood" INTEGER,
    "energy" INTEGER,
    "sleepQuality" INTEGER,
    "hunger" INTEGER,
    "stress" INTEGER,
    "bodyWeight" DOUBLE PRECISION,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseWeeklyCheckinId" TEXT,

    CONSTRAINT "WeeklyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckinImage" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseCheckinImageId" TEXT,

    CONSTRAINT "CheckinImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLog_legacySupabaseProgressLogId_key" ON "ProgressLog"("legacySupabaseProgressLogId");

-- CreateIndex
CREATE INDEX "ProgressLog_clientId_date_idx" ON "ProgressLog"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCheckin_legacySupabaseWeeklyCheckinId_key" ON "WeeklyCheckin"("legacySupabaseWeeklyCheckinId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCheckin_clientId_weekStart_key" ON "WeeklyCheckin"("clientId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyCheckin_clientId_weekStart_idx" ON "WeeklyCheckin"("clientId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "CheckinImage_legacySupabaseCheckinImageId_key" ON "CheckinImage"("legacySupabaseCheckinImageId");

-- CreateIndex
CREATE INDEX "CheckinImage_checkinId_idx" ON "CheckinImage"("checkinId");

-- AddForeignKey
ALTER TABLE "ProgressLog" ADD CONSTRAINT "ProgressLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckin" ADD CONSTRAINT "WeeklyCheckin_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckinImage" ADD CONSTRAINT "CheckinImage_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "WeeklyCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
