-- =====================================================================
-- Buck the Duck — Diagram Labeling cards
--
-- A diagram card stores the uploaded image plus the labels Buck detected
-- (or the user marked):
--   * cards.type         → now also allows 'diagram'
--   * cards.image_url    → public URL of the image in Storage
--   * cards.image_width  → natural size, so marker percentages resolve
--   * cards.image_height
--   * cards.labels       → JSONB [{ id, text, marker:{x,y}, labelPos:{x,y} }]
--                          x/y are percentages (0-100) of the image box.
--
-- Safe to re-run: every statement is guarded.
-- Run AFTER 20260101000000_cards_question_types.sql.
-- =====================================================================

-- 1) Allow the new card type -----------------------------------------
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_type_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_type_check
  CHECK (type IN ('multiple_choice', 'enumeration', 'diagram'));

-- 2) Diagram payload --------------------------------------------------
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS image_width INT;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS image_height INT;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS labels JSONB;

-- Positive dimensions only (a 0 would break percentage maths on the client).
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_image_size_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_image_size_check
  CHECK (
    (image_width IS NULL OR image_width > 0)
    AND (image_height IS NULL OR image_height > 0)
  );

-- Labels must be an array when present.
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_labels_array_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_labels_array_check
  CHECK (labels IS NULL OR jsonb_typeof(labels) = 'array');

-- A diagram card needs an image and at least one label to be answerable.
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_diagram_payload_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_diagram_payload_check
  CHECK (
    type <> 'diagram'
    OR (
      image_url IS NOT NULL
      AND labels IS NOT NULL
      AND jsonb_array_length(labels) > 0
    )
  );

-- Non-diagram cards must not carry diagram payloads (keeps the two shapes honest).
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_nondiagram_payload_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_nondiagram_payload_check
  CHECK (
    type = 'diagram'
    OR (image_url IS NULL AND labels IS NULL)
  );

-- The existing enumeration constraints must not accidentally trap diagram rows.
ALTER TABLE public.cards
  DROP CONSTRAINT IF EXISTS cards_enumeration_items_check;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_enumeration_items_check
  CHECK (
    type <> 'enumeration'
    OR (answer_items IS NOT NULL AND jsonb_array_length(answer_items) > 0)
  );

-- 3) Storage bucket for diagram images ---------------------------------
-- Mirrors the avatars bucket: public read, authenticated write to your own folder
-- (files are stored as <user-id>/<filename>).
--
-- If the bucket/policies already exist on your project (created by hand in the
-- dashboard), this block simply re-applies them; drop it if your project forbids
-- writes to storage.buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diagrams',
  'diagrams',
  true,
  5242880, -- 5MB per image (the client compresses well below this)
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read of diagram images.
DROP POLICY IF EXISTS "diagrams public read" ON storage.objects;
CREATE POLICY "diagrams public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'diagrams');

-- Authenticated users may write/update/delete only inside their own folder.
DROP POLICY IF EXISTS "diagrams owner write" ON storage.objects;
CREATE POLICY "diagrams owner write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'diagrams' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "diagrams owner update" ON storage.objects;
CREATE POLICY "diagrams owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'diagrams' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "diagrams owner delete" ON storage.objects;
CREATE POLICY "diagrams owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'diagrams' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE INDEX IF NOT EXISTS cards_type_idx ON public.cards (type);
