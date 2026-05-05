-- ── recipes table ─────────────────────────────────────────────────────────────
-- Stores parsed recipe data from PDF cookbooks.
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.recipes (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT        NOT NULL,
  ingredients    JSONB       NOT NULL DEFAULT '[]',
  instructions   TEXT        NOT NULL DEFAULT '',
  total_calories INT,
  protein_g      NUMERIC(6,1),
  carbs_g        NUMERIC(6,1),
  fat_g          NUMERIC(6,1),
  servings       INT,
  source_pdf     TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT now(),

  UNIQUE (name, source_pdf)
);

-- Allow the service-role key (used in the API route) full access.
-- Clients can only SELECT.
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all"   ON public.recipes FOR ALL  USING (true) WITH CHECK (true);
CREATE POLICY "client_read" ON public.recipes FOR SELECT USING (true);
