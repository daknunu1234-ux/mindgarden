import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Static guard for the answer-secrecy design (DATABASE.md "Answer secrecy"):
// correct_stmt / trap_rules are read in exactly one module, through the service-role client.
const SRC = join(__dirname, '..', '..', '..')
const ANSWERS = ['features', 'decks', 'services', 'answers.ts'].join(sep)
const ADMIN = ['shared', 'lib', 'supabase', 'admin.ts'].join(sep)
// The only modules allowed to use the service-role client (it bypasses RLS):
// answers (read correct_stmt / trap_rules) and streak (write practice_days, users counters).
const ADMIN_USERS = [ANSWERS, ['features', 'progress', 'services', 'streak.ts'].join(sep)]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('database.types.ts') ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({ rel: relative(SRC, path), code: readFileSync(path, 'utf8') }))

// String arguments of every .select(...) call.
const selectArgs = (code: string) => [...code.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)].map((m) => m[2])

describe('answer secrecy', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.rel === ANSWERS)).toBe(true)
  })

  it('selects correct_stmt / trap_rules only in decks/services/answers.ts', () => {
    const offenders = files
      .filter((f) => f.rel !== ANSWERS)
      .flatMap((f) => selectArgs(f.code).filter((s) => /correct_stmt|trap_rules/.test(s)).map((s) => `${f.rel}: ${s}`))
    expect(offenders).toEqual([])
  })

  it('never selects * from knowledge_items', () => {
    const offenders = files.filter((f) => /from\(\s*['"]knowledge_items['"]\s*\)\s*\.select\(\s*['"]\*['"]/.test(f.code))
    expect(offenders.map((f) => f.rel)).toEqual([])
  })

  it('imports the service-role client only from the allow-listed modules', () => {
    const importers = files.filter((f) => /from ['"]@\/shared\/lib\/supabase\/admin['"]/.test(f.code)).map((f) => f.rel)
    expect([...importers].sort()).toEqual([...ADMIN_USERS].sort())
  })

  it('reads SUPABASE_SERVICE_ROLE_KEY only in admin.ts, and never as a NEXT_PUBLIC_ variable', () => {
    // admin.ts reads it; the allow-listed users only mention it in "key not set" log messages.
    const mentions = files.filter((f) => f.code.includes('SUPABASE_SERVICE_ROLE_KEY') && f.rel !== ADMIN && !ADMIN_USERS.includes(f.rel))
    expect(mentions.map((f) => f.rel)).toEqual([])
    expect(files.filter((f) => /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(f.code)).map((f) => f.rel)).toEqual([ADMIN])
    expect(files.filter((f) => /NEXT_PUBLIC_\w*SERVICE/.test(f.code)).map((f) => f.rel)).toEqual([])
    expect(readFileSync(join(SRC, ADMIN), 'utf8')).toContain("import 'server-only'")
  })
})
