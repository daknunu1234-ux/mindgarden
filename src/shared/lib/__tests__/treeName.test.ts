import { describe, expect, it } from 'vitest'
import { cleanTreeName, defaultTreeName, finishNameEdit, nameEditKey, TREE_NAME_MAX, treeNameError } from '../treeName'

describe('tree names', () => {
  it('cleans what was typed: NFC, invisible characters out, one space, trimmed; diacritics kept', () => {
    expect(cleanTreeName('  Sinh   học\n101  ')).toBe('Sinh học 101')
    expect(cleanTreeName('Ty​thể')).toBe('Tythể')
    // "ọ" typed as o + combining dot below becomes the one composed character.
    expect(cleanTreeName('Sinh học')).toBe('Sinh học')
  })

  it('accepts 1–100 characters (counted as people see them)', () => {
    expect(treeNameError('')).toMatch(/name/)
    expect(treeNameError('A')).toBeNull()
    expect(treeNameError('ọ'.repeat(TREE_NAME_MAX))).toBeNull()
    expect(treeNameError('x'.repeat(TREE_NAME_MAX + 1))).toMatch(/under 101/)
  })

  it('Enter saves, Esc cancels, other keys and IME composition do nothing', () => {
    expect(nameEditKey({ key: 'Enter' })).toBe('save')
    expect(nameEditKey({ key: 'Escape' })).toBe('cancel')
    expect(nameEditKey({ key: 'Enter', isComposing: true })).toBeNull()
    expect(nameEditKey({ key: 'a' })).toBeNull()
  })

  it('finishing an edit: save the cleaned name, nothing when unchanged, the reason when invalid', () => {
    expect(finishNameEdit('Oak Tree', '  Sinh  học ')).toEqual({ kind: 'save', name: 'Sinh học' })
    expect(finishNameEdit('Oak Tree', ' Oak  Tree ')).toEqual({ kind: 'unchanged' })
    expect(finishNameEdit('Oak Tree', '   ')).toEqual({ kind: 'invalid', error: 'Give your tree a name' })
  })

  it('suggests "<Species> Tree", numbered past the names already used', () => {
    expect(defaultTreeName('Oak', [])).toBe('Oak Tree')
    expect(defaultTreeName('Oak', ['oak tree', 'Oak Tree 2', 'Pine Tree'])).toBe('Oak Tree 3')
    expect(defaultTreeName('Crystal Flora', ['Sinh học'])).toBe('Crystal Flora Tree')
  })
})
