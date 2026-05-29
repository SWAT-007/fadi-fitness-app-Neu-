-- AlterTable: Food – add category, brand, barcode, defaultServingG, source
ALTER TABLE "Food" ADD COLUMN "category" TEXT;
ALTER TABLE "Food" ADD COLUMN "brand" TEXT;
ALTER TABLE "Food" ADD COLUMN "barcode" TEXT;
ALTER TABLE "Food" ADD COLUMN "defaultServingG" DOUBLE PRECISION;
ALTER TABLE "Food" ADD COLUMN "source" TEXT;

-- AlterTable: Recipe – add macro/meta fields
ALTER TABLE "Recipe" ADD COLUMN "ingredients" JSONB;
ALTER TABLE "Recipe" ADD COLUMN "servings" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "totalCalories" DOUBLE PRECISION;
ALTER TABLE "Recipe" ADD COLUMN "proteinG" DOUBLE PRECISION;
ALTER TABLE "Recipe" ADD COLUMN "carbsG" DOUBLE PRECISION;
ALTER TABLE "Recipe" ADD COLUMN "fatG" DOUBLE PRECISION;
ALTER TABLE "Recipe" ADD COLUMN "sourcePdf" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "category" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "prepTimeMinutes" INTEGER;
ALTER TABLE "Recipe" ADD COLUMN "cookTimeMinutes" INTEGER;

-- CreateUniqueIndex: Food.barcode
CREATE UNIQUE INDEX "Food_barcode_key" ON "Food"("barcode");

-- CreateIndex: Food.category, Food.brand
CREATE INDEX "Food_category_idx" ON "Food"("category");
CREATE INDEX "Food_brand_idx" ON "Food"("brand");

-- CreateIndex: Recipe.category, Recipe.sourcePdf
CREATE INDEX "Recipe_category_idx" ON "Recipe"("category");
CREATE INDEX "Recipe_sourcePdf_idx" ON "Recipe"("sourcePdf");
