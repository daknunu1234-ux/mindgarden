import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// A real PostgreSQL (PGlite, in-process WASM) with the migrations in supabase/migrations applied in
// filename order, on top of the few Supabase pieces they rely on: the anon / authenticated /
// service_role roles, auth.users and auth.uid(). Tests act as a player with `asUser`, which sets
// the JWT subject auth.uid() reads (functions run as the table owner, as SECURITY DEFINER ones do on
// Supabase; RLS and column grants are NOT exercised here).
const SUPABASE_STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
const migrationFiles = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()

async function apply(db: PGlite, files: readonly string[]): Promise<void> {
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`)
    }
  }
}

// Every migration, or (`before`) every migration whose file name sorts before that one: a test can
// seed data in the older schema, then `applyFrom` the rest to check a data migration.
export async function migratedDb({ before }: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await apply(
    db,
    migrationFiles().filter((f) => !before || f < before),
  )
  return db
}

// The migrations from `first` on (inclusive), in order; with `through`, up to that one (inclusive).
export async function applyFrom(db: PGlite, first: string, { through }: { through?: string } = {}): Promise<void> {
  await apply(
    db,
    migrationFiles().filter((f) => f >= first && (!through || f <= through)),
  )
}

// Run as this player (auth.uid()) until the next call; null = signed out.
export async function asUser(db: PGlite, userId: string | null): Promise<void> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
}
