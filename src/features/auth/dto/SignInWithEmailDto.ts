import { z } from 'zod'
import { safeNextPath } from '../lib/safeNextPath'

export const SignInWithEmailDto = z.object({
  // Trim first: pasted emails often carry spaces, and z.email() checks before .trim().
  email: z.string().trim().max(255).pipe(z.email('Enter a valid email address')),
  next: z
    .string()
    .max(500)
    .optional()
    .transform((v) => safeNextPath(v)),
})

export type SignInWithEmailInput = z.infer<typeof SignInWithEmailDto>
