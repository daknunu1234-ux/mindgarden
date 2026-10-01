import { describe, expect, it } from 'vitest'
import { SignInWithEmailDto } from '../dto/SignInWithEmailDto'
import { oauthRedirectUrl } from '../lib/oauthRedirect'
import { safeNextPath } from '../lib/safeNextPath'

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/deck/cell-biology-101/drill')).toBe('/deck/cell-biology-101/drill')
    expect(safeNextPath('/?page=2')).toBe('/?page=2')
  })

  it('falls back for anything that could leave the site', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'deck', '', null, undefined, '/a\nb']) {
      expect(safeNextPath(bad)).toBe('/')
    }
  })
})

describe('oauthRedirectUrl', () => {
  it('lands on /auth/callback of this origin', () => {
    expect(oauthRedirectUrl('http://localhost:3000', '/')).toBe('http://localhost:3000/auth/callback')
    expect(oauthRedirectUrl('http://localhost:3000')).toBe('http://localhost:3000/auth/callback')
  })

  it('carries the page to come back to, UTF-8 safe', () => {
    const url = new URL(oauthRedirectUrl('https://mindgarden.app', '/deck/sinh-học?review=1'))
    expect(url.origin + url.pathname).toBe('https://mindgarden.app/auth/callback')
    expect(url.searchParams.get('next')).toBe('/deck/sinh-học?review=1')
  })

  it('never carries a path that leaves the site', () => {
    expect(oauthRedirectUrl('https://mindgarden.app', '//evil.com')).toBe('https://mindgarden.app/auth/callback')
  })
})

describe('SignInWithEmailDto', () => {
  it('trims the email and sanitizes next', () => {
    expect(SignInWithEmailDto.parse({ email: ' a@b.co ', next: '//evil.com' })).toEqual({ email: 'a@b.co', next: '/' })
  })

  it('rejects an invalid email', () => {
    expect(SignInWithEmailDto.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})
