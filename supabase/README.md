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

## 4. Before going public: check Row Level Security

The app talks to Supabase straight from the browser with the anon key, which is public by
design. **Row Level Security (RLS) is the only thing stopping one user from reading or
editing another user's data**, so every table the app uses must have it enabled.

Only the `cards` changes live in `migrations/`; the tables below were created in the dashboard,
so check them there. The client reads and writes:

`profiles`, `quiz_history`, `events`, `friendships`, `messages`, `rooms`, `room_players`
(plus `cards`, and the `avatars` and `diagrams` storage buckets).

### Live rooms

`migrations/20261015010000_live_rooms_progress.sql` adds `room_players.progress`,
`room_players.finished_at` and `rooms.started_at`, which the live race uses to show each
opponent's question number and to break podium ties by who finished first. Without it rooms
still work, but opponents show "Answering…" instead of "Q3 of 10".

### Apply the policies

`migrations/20261015000000_row_level_security.sql` turns RLS on for every table above and adds
the policies in the table below. Paste it into the SQL editor and run it. It is safe to re-run,
skips tables your project doesn't have, and only replaces its own `buck_*` policies. It was
tested against tables shaped like the app's: users see only their own history, events and
messages; can't send messages as someone else, accept their own friend request, or change
another player's score; and signed-out visitors can't read any of it.

Then run the audit below. Policies add up (they are OR-ed together), so any older policy that
is wider than these, for example a dashboard default like "Enable read access for all users",
still lets everyone in and must be dropped.

### Audit query

Run this in the SQL editor. Every row should show `rls_enabled = true` and at least one policy:

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;
```

To see what each policy actually allows:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;
```

### What the policies should allow

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | signed-in users (needed for friend search) — never `anon` | only your own row (`id = auth.uid()`) |
| `quiz_history`, `events` | only your own rows (`user_id = auth.uid()`) | only your own rows |
| `friendships` | rows where you are either side | insert as yourself; update/delete rows you're part of |
| `messages` | rows you sent or received | insert only with yourself as sender |
| `rooms`, `room_players` | signed-in users | host manages the room; players manage their own `room_players` row |

Red flags: a policy with `qual = true` for `insert`/`update`/`delete`, any policy granted to
`anon` on these tables, or a table with `rls_enabled = false`. Enabling RLS on a table with no
policies locks it completely, so add the policies in the same change.

### Auth settings (Dashboard → Authentication)

- **Sign In / Providers → Email:** turn on *Confirm email* so throwaway accounts can't be made
  in bulk (each account gets its own AI rate limit).
- **URL Configuration:** set *Site URL* to your production domain and add it (plus
  `https://your-domain/app`) to *Redirect URLs*. Remove `localhost` entries you don't need.
- **Rate Limits:** keep the defaults or lower them; they cap sign-up and email sends.
