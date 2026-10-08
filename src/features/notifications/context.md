# notifications

Messages for a gardener, shown as toasts on their next page load.

## Owned tables
- `notifications` (migration `20261019000000_clone_rewards.sql`): `id`, `user_id`, `kind` ('tree_cloned'), `message`, `data` (jsonb), `read_at`, `created_at`. RLS: the owner reads their rows and may only set `read_at` (column grant). Rows are written by SECURITY DEFINER functions only (today: `clone_deck()` when someone clones your tree: "🎉 A player cloned your tree '<title>'! You earned +50 🪙").

## Exports (`index.ts`)
- `getUnreadNotifications()` (Auth optional): your unread notifications, oldest first, at most 10; `[]` signed out or before the migration.
- `markNotificationsRead({ ids })` (Auth required, Zod: 1–50 uuids): sets `read_at` on yours.
- `NotificationToaster` (client): mounted once in the root layout for signed-in gardeners; toasts the unread ones, then marks them read.

## Dependencies
- `shared/lib/supabase/server`, `shared/lib/supabase/requestUser`, `shared/stores/ToastProvider`.
- Written by: decks `clone_deck()` (database).
