# auth

Sign-in (email magic link) and the header profile button.

## Owned tables
`roles`, `users` (profile columns). Not queried yet: the session user comes from `supabase.auth.getUser()`.

## Exports
| From | Export | Notes |
|------|--------|-------|
| `index.ts` | `signInWithEmail({ email, next? })` | Server Action. Sends a magic link to `/auth/callback?next=…`. Errors: `VALIDATION_FAILED`, `AUTH_RATE_LIMITED`, `INTERNAL_ERROR` |
| `index.ts` | `signOut()` | Server Action. Caller runs `router.refresh()` |
| `index.ts` | `getCurrentUser()` | Server Action → `SessionUser \| null` (root layout, drill page) |
| `index.ts` | `LoginDialog`, `ProfileButton({ user })` — signed in: link to `/profile` + icon-only sign out | Client. The dialog is rendered once in `app/layout.tsx`; open it with `useLoginDialog()` from `shared/stores` |
| `index.ts` | `type SessionUser` | `{ id, email, createdAt }` (`createdAt` = Supabase Auth account creation, shown as "Joined") |
| `server.ts` | `exchangeAuthCode(supabase, code)`, `safeNextPath(next)` | For `app/auth/callback/route.ts` |

## Session refresh
`src/proxy.ts` → `shared/lib/supabase/proxy.ts` `updateSession` (`getClaims()` refreshes tokens on every non-asset request).

## Setup (Supabase dashboard)
- Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/auth/callback` (and the production URL)
- The built-in mailer is rate-limited; set up custom SMTP before real users

## May import
`@/shared/*` only
