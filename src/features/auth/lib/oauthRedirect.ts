import { safeNextPath } from './safeNextPath'

// Where an OAuth provider (Google) sends the player back: /auth/callback on this origin, which
// exchanges the code and then goes to `next`. The root needs no `next` (the callback's default).
export function oauthRedirectUrl(origin: string, next?: string | null): string {
  const redirect = new URL('/auth/callback', origin)
  const path = safeNextPath(next)
  if (path !== '/') redirect.searchParams.set('next', path)
  return redirect.toString()
}
