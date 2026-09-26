import { splitMutation } from '../lib/splitMutation'

type MutationHighlightProps = {
  text: string
  compareTo: string
  tone: 'amber' | 'gold'
}

const TONE = { amber: 'bg-amber-200', gold: 'bg-yellow-200' } as const

// Marks the words in `text` that differ from `compareTo`.
function MutationHighlight({ text, compareTo, tone }: MutationHighlightProps) {
  const { before, changed, after } = splitMutation(text, compareTo)
  return (
    <span className="whitespace-pre-wrap">
      {before}
      {changed && <mark className={`${TONE[tone]} rounded px-0.5 text-inherit`}>{changed}</mark>}
      {after}
    </span>
  )
}

export { MutationHighlight }
