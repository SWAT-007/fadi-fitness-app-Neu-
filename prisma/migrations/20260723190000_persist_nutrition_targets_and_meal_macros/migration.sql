-- AlterTable
ALTER TABLE "NutritionPlan"
ADD COLUMN "goal" TEXT NOT NULL DEFAULT 'maintain',
ADD COLUMN "targetCalories" DOUBLE PRECISION,
ADD COLUMN "targetProtein" DOUBLE PRECISION,
ADD COLUMN "targetCarbs" DOUBLE PRECISION,
ADD COLUMN "targetFat" DOUBLE PRECISION;

-- Preserve targets written by the previous create form into the description.
UPDATE "NutritionPlan"
SET
  "targetCalories" = substring("description" from 'Tagesziele: ([0-9]+(?:\.[0-9]+)?) kcal')::DOUBLE PRECISION,
  "targetProtein" = substring("description" from 'kcal · ([0-9]+(?:\.[0-9]+)?) g Eiweiß')::DOUBLE PRECISION,
  "targetFat" = substring("description" from 'Eiweiß · ([0-9]+(?:\.[0-9]+)?) g Fett')::DOUBLE PRECISION,
  "targetCarbs" = substring("description" from 'Fett · ([0-9]+(?:\.[0-9]+)?) g Kohlenhydrate')::DOUBLE PRECISION
WHERE "description" ~ '^Tagesziele: [0-9]';

-- AlterTable
ALTER TABLE "MealLog"
ADD COLUMN "calories" DOUBLE PRECISION,
ADD COLUMN "protein" DOUBLE PRECISION,
ADD COLUMN "carbs" DOUBLE PRECISION,
ADD COLUMN "fat" DOUBLE PRECISION;
