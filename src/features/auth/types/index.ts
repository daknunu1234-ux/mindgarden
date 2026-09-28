// The signed-in player as the UI sees it.
// createdAt: ISO timestamp of the Supabase Auth account ("joined" date).
export type SessionUser = { id: string; email: string; createdAt: string }
