import type { ReactNode } from 'react'
import type { DeckEditor } from '../types'

// Visitor view of a shared tree (strict read-only mode): every root in tree order with its true
// statements, as plain text. No edit controls. `rootAction` lets the page put a control on each root
// (the Mind Tournament's "⚔️ Compete Root"); without it the list is read-only (visitors clone to practise).
function DeckReader({ reader, rootAction }: { reader: DeckEditor; rootAction?: (rootId: string) => ReactNode }) {
  if (reader.nodes.length === 0) {
    return <p className="text-center text-sm text-amber-100/80">This tree has no roots yet.</p>
  }

  return (
    <ol className="space-y-3">
      {reader.nodes.map((node) => (
        <li
          key={node.id}
          style={{ marginLeft: `${Math.min(node.depth, 4) * 1.25}rem` }}
          className="rounded-[18px] border-[2.5px] border-[#c9955e] bg-gradient-to-b from-[#fffcf3] to-[#f7e2bd] p-3 shadow-[inset_0_2px_0_#fff,0_4px_0_#b07a45]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-game text-base font-extrabold text-[#4a2511]">
              <span aria-hidden className="mr-1.5">
                {node.depth === 0 ? '🌳' : '🌿'}
              </span>
              {node.title}
            </h3>
            {rootAction && node.items.some((i) => i.drillable) && rootAction(node.id)}
          </div>
          {node.items.length === 0 ? (
            <p className="mt-1 text-sm text-amber-900/55">No statements on this root.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {node.items.map((item) => (
                <li key={item.id} className="flex gap-2 rounded-xl bg-white/85 px-3 py-2 text-sm leading-snug text-stone-800">
                  <span aria-hidden>📜</span>
                  <span className="min-w-0 break-words whitespace-pre-wrap">{item.statement}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

export { DeckReader }
