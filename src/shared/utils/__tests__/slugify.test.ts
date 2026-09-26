import { describe, expect, it } from 'vitest'
import { slugify } from '../slugify'

describe('slugify', () => {
  it('makes kebab-case slugs', () => {
    expect(slugify('Cell Biology 101')).toBe('cell-biology-101')
    expect(slugify('  Hello,   World!  ')).toBe('hello-world')
  })

  it('strips Vietnamese diacritics, including đ', () => {
    expect(slugify('Sinh học Tế bào')).toBe('sinh-hoc-te-bao')
    expect(slugify('Động lực học')).toBe('dong-luc-hoc')
    expect(slugify('Khi nhiệt độ tăng'.normalize('NFD'))).toBe('khi-nhiet-do-tang')
  })

  it('falls back when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('deck')
    expect(slugify('日本語')).toBe('deck')
  })

  it('respects maxLength without a trailing dash', () => {
    const slug = slugify('a'.repeat(10) + ' ' + 'b'.repeat(10), { maxLength: 11 })
    expect(slug).toBe('aaaaaaaaaa')
  })

  it('always matches the DB kebab-case check', () => {
    for (const title of ['Ôn tập — Chương 1', 'x--y', '---', 'A/B testing', 'Tế bào & Mô']) {
      expect(slugify(title)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })
})
