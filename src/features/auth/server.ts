// Server-only public API (used by app/auth/callback/route.ts).
import 'server-only'

export { exchangeAuthCode } from './services/session'
export { safeNextPath } from './lib/safeNextPath'
