// An in-memory stand-in for the Supabase client the decks services use on content_nodes (unit tests;
// the real SQL is tested on PGlite). It behaves like the database where the services rely on it:
//   RLS        rows of a tree are readable when it is public or the viewer's; writes only by its owner
//              (a refused update / delete touches 0 rows, a refused insert errors 42501)
//   shape      a top-level node is a root (TOP_LEVEL_STATEMENT), a parent in the same tree (23503),
//              no node under its own branch (NODE_CYCLE), statements in plain text (23514)
//   cascades   deleting a node deletes its branch and every progress row on those nodes
// Every write is recorded in `writes` (table, op, data, filters) so a test can assert what happened.

export type FakeDeck = { id: string; user_id: string; slug?: string; tree_type?: string; is_public?: boolean }
export type FakeNode = {
  id: string
  deck_id: string
  parent_id: string | null
  node_type: 'root' | 'statement'
  content: string
  sort_order: number
  trap_rules?: unknown
  created_at?: string
}
export type FakeProgress = { user_id: string; knowledge_item_id: string; mastery_level: number }

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean
type Result = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

const LATEX = /\\[a-zA-Z]+/

export function fakeContentDb({
  viewer,
  decks,
  nodes = [],
  progress = [],
  tournamentProgress = [],
  rpc = async () => ({ data: null, error: null }),
}: {
  viewer: string | null
  decks: FakeDeck[]
  nodes?: FakeNode[]
  progress?: FakeProgress[]
  tournamentProgress?: FakeProgress[]
  rpc?: (fn: string, args: Row) => Promise<Result>
}) {
  const db = {
    decks: decks.map((d) => ({ slug: 'tree', tree_type: 'oak', is_public: false, ...d })) as Row[],
    content_nodes: nodes.map((n) => ({ trap_rules: n.node_type === 'statement' ? { negate: true } : {}, created_at: '2026-10-01T00:00:00Z', ...n })) as Row[],
    user_progress: progress.map((p) => ({ ...p })) as Row[],
    deck_tournament_item_progress: tournamentProgress.map((p) => ({ ...p })) as Row[],
  }
  const writes: { table: string; op: 'insert' | 'update' | 'delete'; data?: unknown; where: Row }[] = []
  let nextId = 0

  const deckOf = (id: unknown) => db.decks.find((d) => d.id === id)
  const readable = (deckId: unknown) => {
    const d = deckOf(deckId)
    return Boolean(d && (d.is_public || d.user_id === viewer))
  }
  const owns = (deckId: unknown) => deckOf(deckId)?.user_id === viewer
  const nodeById = (id: unknown) => db.content_nodes.find((n) => n.id === id)
  const branchIds = (id: unknown): Set<unknown> => {
    const out = new Set<unknown>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const n of db.content_nodes) {
        if (n.parent_id && out.has(n.parent_id) && !out.has(n.id)) {
          out.add(n.id)
          grew = true
        }
      }
    }
    return out
  }
  // The shape rules the database enforces on a node about to be written.
  const shapeError = (n: Row): Result['error'] => {
    if (n.parent_id === null && n.node_type !== 'root') return { code: 'P0001', message: 'TOP_LEVEL_STATEMENT' }
    if (n.parent_id !== null && nodeById(n.parent_id)?.deck_id !== n.deck_id) return { code: '23503', message: 'content_nodes_parent_fkey' }
    if (n.node_type === 'statement' && LATEX.test(String(n.content))) return { code: '23514', message: 'content_nodes_plain_statement' }
    if (n.parent_id !== null && n.id !== undefined && branchIds(n.id).has(n.parent_id)) return { code: 'P0001', message: 'NODE_CYCLE' }
    return null
  }

  const from = (table: string) => {
    const filters: Filter[] = []
    const where: Row = {}
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row | Row[] = {}
    let head = false
    let countExact = false
    let limit = Infinity
    const orders: { col: string; asc: boolean }[] = []
    const rows = (): Row[] => {
      let list = (db as Record<string, Row[]>)[table]
      if (!list) throw new Error(`fakeContentDb: unexpected table ${table}`)
      if (table === 'content_nodes' || table === 'decks') list = list.filter((r) => readable(table === 'decks' ? r.id : r.deck_id))
      list = list.filter((r) => filters.every((f) => f(r)))
      for (const { col, asc } of [...orders].reverse()) list = [...list].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
      return list.slice(0, limit)
    }
    const run = (): Result => {
      if (mode === 'insert') {
        const input = Array.isArray(payload) ? payload : [payload]
        const created: Row[] = []
        for (const r of input) {
          if (!owns(r.deck_id)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
          const row = { id: `new-${nextId++}`, parent_id: null, node_type: 'statement', sort_order: 0, created_at: '2026-10-02T00:00:00Z', ...r }
          const bad = shapeError({ ...row, id: undefined })
          if (bad) return { data: null, error: bad }
          created.push(row)
        }
        db.content_nodes.push(...created)
        writes.push({ table, op: 'insert', data: payload, where: {} })
        return { data: created.map((r) => ({ id: r.id })), error: null }
      }
      if (mode === 'update') {
        const hit = rows().filter((r) => owns(r.deck_id))
        for (const r of hit) {
          const bad = shapeError({ ...r, ...(payload as Row) })
          if (bad) return { data: null, error: bad }
        }
        writes.push({ table, op: 'update', data: payload, where: { ...where } })
        for (const r of hit) Object.assign(r, payload)
        return { data: hit.map((r) => ({ id: r.id })), error: null }
      }
      if (mode === 'delete') {
        const hit = rows().filter((r) => owns(r.deck_id))
        writes.push({ table, op: 'delete', where: { ...where } })
        const gone = new Set<unknown>()
        for (const r of hit) for (const id of branchIds(r.id)) gone.add(id)
        db.content_nodes = db.content_nodes.filter((n) => !gone.has(n.id))
        db.user_progress = db.user_progress.filter((p) => !gone.has(p.knowledge_item_id))
        db.deck_tournament_item_progress = db.deck_tournament_item_progress.filter((p) => !gone.has(p.knowledge_item_id))
        return { data: hit.map((r) => ({ id: r.id })), error: null }
      }
      const list = rows()
      return head ? { data: null, error: null, count: list.length } : { data: list, error: null, count: countExact ? list.length : null }
    }
    const q = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        head = Boolean(opts?.head)
        countExact = opts?.count === 'exact'
        return q
      },
      eq: (col: string, value: unknown) => {
        where[col] = value
        filters.push((r) => r[col] === value)
        return q
      },
      is: (col: string, value: unknown) => {
        where[col] = value
        filters.push((r) => (r[col] ?? null) === value)
        return q
      },
      in: (col: string, values: unknown[]) => {
        where[col] = values
        filters.push((r) => values.includes(r[col]))
        return q
      },
      gt: (col: string, value: number) => {
        filters.push((r) => (r[col] as number) > value)
        return q
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orders.push({ col, asc: opts?.ascending ?? true })
        return q
      },
      limit: (n: number) => {
        limit = n
        return q
      },
      insert: (r: Row | Row[]) => {
        mode = 'insert'
        payload = r
        return q
      },
      update: (patch: Row) => {
        mode = 'update'
        payload = patch
        return q
      },
      delete: () => {
        mode = 'delete'
        return q
      },
      maybeSingle: async () => {
        const res = run()
        return { ...res, data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data }
      },
      single: async () => {
        const res = run()
        return { ...res, data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data }
      },
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    }
    return q
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null } }) },
    from,
    rpc: (fn: string, args: Row) => rpc(fn, args),
  }
  return { client, db, writes, node: (id: string) => db.content_nodes.find((n) => n.id === id) }
}
