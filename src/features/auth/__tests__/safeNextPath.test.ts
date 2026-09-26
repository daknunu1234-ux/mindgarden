import { describe, expect, it } from 'vitest'
import { SignInWithEmailDto } from '../dto/SignInWithEmailDto'
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

describe('SignInWithEmailDto', () => {
  it('trims the email and sanitizes next', () => {
    expect(SignInWithEmailDto.parse({ email: ' a@b.co ', next: '//evil.com' })).toEqual({ email: 'a@b.co', next: '/' })
  })

  it('rejects an invalid email', () => {
    expect(SignInWithEmailDto.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})
