-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "caloriesPer100g" DOUBLE PRECISION,
    "proteinPer100g" DOUBLE PRECISION,
    "carbsPer100g" DOUBLE PRECISION,
    "fatPer100g" DOUBLE PRECISION,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseFoodId" TEXT,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseRecipeId" TEXT,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseNutritionPlanId" TEXT,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseNutritionMealId" TEXT,

    CONSTRAINT "NutritionMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedNutritionPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacySupabaseAssignedNutritionPlanId" TEXT,

    CONSTRAINT "AssignedNutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMealFood" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mealId" TEXT,
    "foodId" TEXT,
    "category" TEXT,
    "amountG" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseClientMealFoodId" TEXT,

    CONSTRAINT "ClientMealFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealHistory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT,
    "category" TEXT,
    "amountG" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacySupabaseMealHistoryId" TEXT,

    CONSTRAINT "MealHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mealType" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySupabaseMealLogId" TEXT,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrinkLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "drinkType" TEXT,
    "amountMl" DOUBLE PRECISION,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacySupabaseDrinkLogId" TEXT,

    CONSTRAINT "DrinkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_legacySupabaseFoodId_key" ON "Food"("legacySupabaseFoodId");

-- CreateIndex
CREATE INDEX "Food_trainerId_idx" ON "Food"("trainerId");

-- CreateIndex
CREATE INDEX "Food_name_idx" ON "Food"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_legacySupabaseRecipeId_key" ON "Recipe"("legacySupabaseRecipeId");

-- CreateIndex
CREATE INDEX "Recipe_trainerId_idx" ON "Recipe"("trainerId");

-- CreateIndex
CREATE INDEX "Recipe_name_idx" ON "Recipe"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionPlan_legacySupabaseNutritionPlanId_key" ON "NutritionPlan"("legacySupabaseNutritionPlanId");

-- CreateIndex
CREATE INDEX "NutritionPlan_trainerId_idx" ON "NutritionPlan"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionMeal_legacySupabaseNutritionMealId_key" ON "NutritionMeal"("legacySupabaseNutritionMealId");

-- CreateIndex
CREATE INDEX "NutritionMeal_planId_sortOrder_idx" ON "NutritionMeal"("planId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedNutritionPlan_legacySupabaseAssignedNutritionPlanId_key" ON "AssignedNutritionPlan"("legacySupabaseAssignedNutritionPlanId");

-- CreateIndex
CREATE INDEX "AssignedNutritionPlan_clientId_active_idx" ON "AssignedNutritionPlan"("clientId", "active");

-- CreateIndex
CREATE INDEX "AssignedNutritionPlan_planId_idx" ON "AssignedNutritionPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedNutritionPlan_clientId_planId_key" ON "AssignedNutritionPlan"("clientId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMealFood_legacySupabaseClientMealFoodId_key" ON "ClientMealFood"("legacySupabaseClientMealFoodId");

-- CreateIndex
CREATE INDEX "ClientMealFood_clientId_idx" ON "ClientMealFood"("clientId");

-- CreateIndex
CREATE INDEX "ClientMealFood_mealId_idx" ON "ClientMealFood"("mealId");

-- CreateIndex
CREATE INDEX "ClientMealFood_foodId_idx" ON "ClientMealFood"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "MealHistory_legacySupabaseMealHistoryId_key" ON "MealHistory"("legacySupabaseMealHistoryId");

-- CreateIndex
CREATE INDEX "MealHistory_clientId_loggedAt_idx" ON "MealHistory"("clientId", "loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealLog_legacySupabaseMealLogId_key" ON "MealLog"("legacySupabaseMealLogId");

-- CreateIndex
CREATE INDEX "MealLog_clientId_date_idx" ON "MealLog"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DrinkLog_legacySupabaseDrinkLogId_key" ON "DrinkLog"("legacySupabaseDrinkLogId");

-- CreateIndex
CREATE INDEX "DrinkLog_clientId_loggedAt_idx" ON "DrinkLog"("clientId", "loggedAt");

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionMeal" ADD CONSTRAINT "NutritionMeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedNutritionPlan" ADD CONSTRAINT "AssignedNutritionPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedNutritionPlan" ADD CONSTRAINT "AssignedNutritionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMealFood" ADD CONSTRAINT "ClientMealFood_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMealFood" ADD CONSTRAINT "ClientMealFood_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "NutritionMeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMealFood" ADD CONSTRAINT "ClientMealFood_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealHistory" ADD CONSTRAINT "MealHistory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkLog" ADD CONSTRAINT "DrinkLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
