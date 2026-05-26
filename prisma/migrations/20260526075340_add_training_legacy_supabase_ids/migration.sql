-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "legacySupabasePlanId" TEXT;

-- AlterTable
ALTER TABLE "AssignedPlan" ADD COLUMN     "legacySupabaseAssignedPlanId" TEXT;

-- AlterTable
ALTER TABLE "WorkoutDay" ADD COLUMN     "legacySupabaseDayId" TEXT;

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "legacySupabaseExerciseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlan_legacySupabasePlanId_key" ON "WorkoutPlan"("legacySupabasePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedPlan_legacySupabaseAssignedPlanId_key" ON "AssignedPlan"("legacySupabaseAssignedPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDay_legacySupabaseDayId_key" ON "WorkoutDay"("legacySupabaseDayId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_legacySupabaseExerciseId_key" ON "Exercise"("legacySupabaseExerciseId");
