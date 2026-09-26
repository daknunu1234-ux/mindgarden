import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { countDeckTree, type DeckDetail, type DeckTreeNode } from '@/features/decks'
import { getTreeIcon } from '@/features/garden'

type DeckSceneProps = { detail: DeckDetail }

// Route-level composition for /deck/[slug]. The roots section is a placeholder
// until the mindmap feature (RootMap) lands.
function DeckScene({ detail }: DeckSceneProps) {
  const { deck, tree } = detail
  const { nodeCount, itemCount } = countDeckTree(tree)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Garden
      </Link>

      <header className="mt-6 flex items-start gap-4">
        <span aria-hidden className="text-5xl leading-none">
          {getTreeIcon(deck.treeType)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{deck.title}</h1>
            <Badge variant="outline" className="capitalize">
              {deck.treeType}
            </Badge>
            {!deck.isPublic && <Badge variant="secondary">Private</Badge>}
          </div>
          {deck.description && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{deck.description}</p>
          )}
          <dl className="mt-4 flex gap-6 text-sm">
            <Stat label="Roots" value={nodeCount} />
            <Stat label="Knowledge items" value={itemCount} />
          </dl>
        </div>
      </header>

      <div className="mt-10 border-t-2 border-amber-800/30" role="separator" aria-label="Ground line" />

      <section aria-labelledby="roots-heading" className="mt-6">
        <h2 id="roots-heading" className="text-lg font-medium">
          Roots
        </h2>
        <div className="mt-3 rounded-xl border border-dashed bg-amber-50/40 p-6">
          {tree.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No roots yet. This tree is waiting for its first concept 🌱
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                Mindmap view coming soon. For now, here is the outline.
              </p>
              <RootOutline nodes={tree} />
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function RootOutline({ nodes, nested = false }: { nodes: DeckTreeNode[]; nested?: boolean }) {
  return (
    <ul className={nested ? 'space-y-1 border-l border-amber-800/20 pl-4' : 'space-y-1'}>
      {nodes.map((node) => (
        <li key={node.id}>
          <span className="font-medium">{node.title}</span>
          {node.items.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {node.items.length} {node.items.length === 1 ? 'item' : 'items'}
            </span>
          )}
          {node.children.length > 0 && (
            <div className="mt-1">
              <RootOutline nodes={node.children} nested />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export { DeckScene }
