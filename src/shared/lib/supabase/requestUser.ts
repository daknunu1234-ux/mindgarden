import 'server-only'
import { cache } from 'react'
import { createClient } from './server'

// The verified user for this request (supabase.auth.getUser(), checked by the Supabase Auth
// server), or null when signed out. React's `cache` makes it one Auth round trip per server
// request, however many actions on a page ask for it (the deck page used to make up to five).
// The cache never outlives the request, so a session can't leak across users. Outside a React
// server render (e.g. tests) it simply calls through.
export const getRequestUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
