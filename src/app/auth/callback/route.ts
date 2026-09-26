import { NextResponse, type NextRequest } from 'next/server'
import { exchangeAuthCode, safeNextPath } from '@/features/auth/server'
import { createClient } from '@/shared/lib/supabase/server'

// GET /auth/callback?code=…&next=/deck/… (API SPEC.md): magic-link landing page.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    if (await exchangeAuthCode(supabase, code)) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }
  return NextResponse.redirect(new URL('/?login=error', origin))
}
