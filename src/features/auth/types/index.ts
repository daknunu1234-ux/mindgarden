// The signed-in player as the UI sees it.
// createdAt: ISO timestamp of the Supabase Auth account ("joined" date).
// displayName: the public "Garden Name" they chose (users.display_name), null until they pick one.
export type SessionUser = { id: string; email: string; createdAt: string; displayName: string | null }
