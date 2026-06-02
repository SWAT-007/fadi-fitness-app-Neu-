-- AlterTable
ALTER TABLE "ClientMealFood" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NutritionMeal" ADD COLUMN     "allowedCategories" JSONB,
ADD COLUMN     "targetCarbs" DOUBLE PRECISION,
ADD COLUMN     "targetFat" DOUBLE PRECISION,
ADD COLUMN     "targetProtein" DOUBLE PRECISION,
ADD COLUMN     "targetVegetableG" DOUBLE PRECISION;
