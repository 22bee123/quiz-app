-- =====================================================================
-- Buck the Duck — card question types (multiple choice + enumeration)
--
-- Adds the storage the enumeration question type needs:
--   * cards.type         → 'multiple_choice' | 'enumeration'
--   * cards.answer_items → JSONB array of expected items (enumeration only)
--
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.
-- If your cards table lives in a non-default schema, change the schema
-- qualified names below (public.cards) before running it.
-- =====================================================================

-- 1) Question type ----------------------------------------------------
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'multiple_choice';

-- A card can only ever be one of the two shapes Buck can write.
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_type_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_type_check
  CHECK (type IN ('multiple_choice', 'enumeration'));

-- 2) Expected items for enumeration cards -----------------------------
-- Null for multiple choice; a JSON array of short strings for enumeration.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS answer_items JSONB;

-- Must be an array when present (never a bare string or object).
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_answer_items_array_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_answer_items_array_check
  CHECK (answer_items IS NULL OR jsonb_typeof(answer_items) = 'array');

-- Enumeration cards must carry a non-empty list of items...
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_enumeration_items_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_enumeration_items_check
  CHECK (
    type <> 'enumeration'
    OR (answer_items IS NOT NULL AND jsonb_array_length(answer_items) > 0)
  );

-- ...and multiple-choice cards must not carry one.
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_mc_items_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_mc_items_check
  CHECK (type <> 'multiple_choice' OR answer_items IS NULL);

-- 3) Query helper -----------------------------------------------------
CREATE INDEX IF NOT EXISTS cards_type_idx ON public.cards (type);

-- =====================================================================
-- Optional backfill: existing rows default to 'multiple_choice', which
-- matches the app's legacy "choice" cards. Rows that stored the older
-- "flashcard" shape should be mapped explicitly, e.g.
--
--   UPDATE public.cards SET type = 'multiple_choice' WHERE type = 'flashcard';
-- =====================================================================
