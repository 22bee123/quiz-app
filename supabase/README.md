# Supabase setup — Buck the Duck

The app runs without Supabase (StudyPacks live in `localStorage`), but two features
need a project:

| Feature | Needs Supabase |
| --- | --- |
| Auth, quiz history, live rooms, friends | `SUPABASE_URL` + `SUPABASE_ANON_KEY` |
| Diagram Labeling image storage | auth + the `diagrams` bucket below |

## 1. Run the migrations

Apply, in order, in the Supabase SQL editor (or with the Supabase CLI):

1. `migrations/20260101000000_cards_question_types.sql` — `cards.type`, `cards.answer_items`
2. `migrations/20260102000000_cards_diagram_labeling.sql` — `cards.image_url`,
   `cards.image_width`, `cards.image_height`, `cards.labels` + the `diagrams` bucket

Both are idempotent, so re-running them is safe.

## 2. The `diagrams` bucket

The second migration creates it, but it can also be made by hand:

- **Name:** `diagrams`
- **Public bucket:** yes (diagram images are read straight from the CDN)
- **File size limit:** 5 MB
- **Allowed MIME types:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`

Policies (public read, and authenticated write limited to your own `<user-id>/…` folder)
are created by the migration. They mirror the `avatars` bucket.

## 3. If the bucket is missing

Nothing breaks. The client tries Storage first and, if the upload fails — no session,
demo mode, missing bucket, RLS rejection — it downsizes the image in the browser and
stores it inline with the card instead, showing a small "stored on this device" note.
Set the bucket up to move those images into Storage.
