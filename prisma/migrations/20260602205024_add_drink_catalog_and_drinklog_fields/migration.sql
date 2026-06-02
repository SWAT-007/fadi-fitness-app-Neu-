-- AlterTable
ALTER TABLE "DrinkLog" ADD COLUMN     "calories" DOUBLE PRECISION,
ADD COLUMN     "mealId" TEXT;

-- CreateTable
CREATE TABLE "Drink" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "kcalPer100ml" DOUBLE PRECISION,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drink_trainerId_idx" ON "Drink"("trainerId");

-- CreateIndex
CREATE INDEX "Drink_name_idx" ON "Drink"("name");

-- CreateIndex
CREATE INDEX "DrinkLog_mealId_idx" ON "DrinkLog"("mealId");

-- AddForeignKey
ALTER TABLE "DrinkLog" ADD CONSTRAINT "DrinkLog_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "NutritionMeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drink" ADD CONSTRAINT "Drink_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
