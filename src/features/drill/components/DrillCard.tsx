'use client'

import { MASTERY_NAMES } from '@/features/progress'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import type { DrillState } from '../hooks/useDrillSession'
import type { DrillProgress, DrillQuestion, DrillTag } from '../types'
import { ChoiceButton, type ChoiceState } from './ChoiceButton'
import { MutationHighlight } from './MutationHighlight'

type DrillCardProps = {
  question: DrillQuestion
  state: DrillState
  onSelect: (tag: DrillTag) => void
}

function choiceState(tag: DrillTag, state: DrillState): ChoiceState {
  if (state.status === 'answering' || state.status === 'done') return 'idle'
  if (state.status === 'checking') return tag === state.picked ? 'pending' : 'idle'
  if (state.status === 'error') return tag === state.picked ? 'idle' : 'muted'
  if (tag === state.answer.correctTag) return 'correct'
  if (tag === state.picked) return 'practice'
  return 'muted'
}

function DrillCard({ question, state, onSelect }: DrillCardProps) {
  const locked = state.status !== 'answering'
  const textOf = (tag: DrillTag) => question.choices.find((c) => c.tag === tag)?.text ?? ''

  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          {question.nodeTitle}
        </Badge>
        <CardTitle className="mt-2 text-xl leading-snug whitespace-pre-wrap">{question.prompt}</CardTitle>
        <p className="text-sm text-muted-foreground">Which statement is true?</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {question.choices.map((choice) => (
          <ChoiceButton
            key={choice.tag}
            choice={choice}
            state={choiceState(choice.tag, state)}
            disabled={locked}
            onSelect={onSelect}
          />
        ))}

        {state.status === 'feedback' && (
          <div
            role="status"
            className={
              state.answer.isCorrect
                ? 'rounded-xl border border-yellow-500 bg-yellow-50 p-4 text-yellow-900'
                : 'rounded-xl border border-amber-500 bg-amber-50 p-4 text-amber-900'
            }
          >
            {state.answer.isCorrect ? (
              <p className="font-medium">Golden! This root just got stronger ✨</p>
            ) : (
              <>
                <p className="font-medium">Almost! This root needs a little more water 🌿</p>
                <p className="mt-3 text-sm">
                  The trap changed:{' '}
                  <MutationHighlight
                    text={textOf(state.picked)}
                    compareTo={textOf(state.answer.correctTag)}
                    tone="amber"
                  />
                </p>
                <p className="mt-1 text-sm">
                  The true statement:{' '}
                  <MutationHighlight
                    text={textOf(state.answer.correctTag)}
                    compareTo={textOf(state.picked)}
                    tone="gold"
                  />
                </p>
              </>
            )}
            {state.progress && <MasteryMeter progress={state.progress} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MasteryMeter({ progress }: { progress: DrillProgress }) {
  const { masteryLevel } = progress
  return (
    <p className="mt-3 flex items-center gap-2 text-sm">
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={step <= masteryLevel ? 'size-2.5 rounded-full bg-yellow-500' : 'size-2.5 rounded-full bg-muted-foreground/25'}
          />
        ))}
      </span>
      <span>
        {MASTERY_NAMES[masteryLevel]} · {masteryLevel}/3
      </span>
    </p>
  )
}

export { DrillCard }
