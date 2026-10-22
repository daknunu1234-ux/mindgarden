import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { oauthRedirectUrl } from '../lib/oauthRedirect'

// Google sign-in must work the same on localhost and on the Vercel production site: the button is
// always in the login dialog (no environment check, flag or public env variable), and Google sends the
// player back to /auth/callback on whatever origin they signed in from.

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8')

describe('the Google button is never hidden', () => {
  const dialog = read('components', 'LoginDialog.tsx')
  const button = read('components', 'GoogleSignInButton.tsx')

  it('the login dialog always renders it, before the email form', () => {
    expect(dialog).toContain('<GoogleSignInButton next={next}')
    // Not behind a condition: the button is the form's first child, not inside `{… && …}` or a ternary.
    expect(dialog).toMatch(/<form onSubmit=\{submit\} className="space-y-4">\s*<GoogleSignInButton /)
  })

  it('nothing in the sign-in path depends on the environment', () => {
    for (const [name, src] of [
      ['LoginDialog.tsx', dialog],
      ['GoogleSignInButton.tsx', button],
    ] as const) {
      expect(src, name).not.toMatch(/process\.env|NODE_ENV|NEXT_PUBLIC_|isDev|featureFlag/)
    }
  })
})

describe('the OAuth redirect follows the site the player is on', () => {
  it('uses the browser’s own origin, so localhost and Vercel each come back to themselves', () => {
    expect(read('components', 'GoogleSignInButton.tsx')).toContain('redirectTo: oauthRedirectUrl(window.location.origin, next)')
    expect(oauthRedirectUrl('http://localhost:3000', '/deck/sinh-hoc')).toBe('http://localhost:3000/auth/callback?next=%2Fdeck%2Fsinh-hoc')
    expect(oauthRedirectUrl('https://mindgarden-k1lf.vercel.app', '/profile')).toBe('https://mindgarden-k1lf.vercel.app/auth/callback?next=%2Fprofile')
    expect(oauthRedirectUrl('https://mindgarden-k1lf.vercel.app', '/')).toBe('https://mindgarden-k1lf.vercel.app/auth/callback')
  })

  it('never sends the player to another site after signing in', () => {
    expect(oauthRedirectUrl('https://mindgarden-k1lf.vercel.app', 'https://evil.example/x')).toBe('https://mindgarden-k1lf.vercel.app/auth/callback')
    expect(oauthRedirectUrl('https://mindgarden-k1lf.vercel.app', '//evil.example')).toBe('https://mindgarden-k1lf.vercel.app/auth/callback')
  })

  it('the magic link uses the request’s origin too, or APP_URL when set', () => {
    const action = read('actions', 'signInWithEmail.ts')
    expect(action).toContain("process.env.APP_URL || h.get('origin')")
  })
})
