'use client'

import { isMastered, MASTERY_NAMES, MAX_MASTERY } from '@/shared/lib/mastery'
import { GamePanel, GameProgressBar, GameSlab, ParticleBurst } from '@/shared/components/game'
import type { DrillState } from '../hooks/useDrillSession'
import { becameMighty, leveledUp } from '../lib/masteryChange'
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

// The question plaque + tactile choice slabs + feedback scroll.
function DrillCard({ question, state, onSelect }: DrillCardProps) {
  const locked = state.status !== 'answering'
  const textOf = (tag: DrillTag) => question.choices.find((c) => c.tag === tag)?.text ?? ''

  return (
    <div className="space-y-5">
      {/* Items authored in-app use the root title as their prompt; then the ribbon says so instead. */}
      <GamePanel tone="parchment" ribbon="leaf" title={question.prompt !== question.nodeTitle ? question.nodeTitle : 'Which is true?'}>
        <h2 className="text-center font-game text-xl leading-snug font-bold whitespace-pre-wrap sm:text-2xl">{question.prompt}</h2>
        {question.prompt !== question.nodeTitle && (
          <p className="mt-1 text-center text-sm font-medium text-amber-900/65">Which statement is true?</p>
        )}
      </GamePanel>

      <div className="space-y-3.5" role="group" aria-label="Choices">
        {question.choices.map((choice) => (
          <ChoiceButton key={choice.tag} choice={choice} state={choiceState(choice.tag, state)} disabled={locked} onSelect={onSelect} />
        ))}
      </div>
      <p className="hidden text-center text-xs font-medium text-amber-900/55 sm:block">
        Press {question.choices.map((_, i) => i + 1).join(' / ')} or {question.choices.map((c) => c.tag).join(' / ')} to answer · Enter
        for the next one
      </p>

      {state.status === 'feedback' && (
        <GameSlab role="status" tone={state.answer.isCorrect ? 'gold' : 'cream'} className="mg-land relative p-4 sm:p-5">
          {leveledUp(state.progress) && <ParticleBurst key={question.itemId} count={becameMighty(state.progress) ? 28 : 16} />}
          {state.answer.isCorrect ? (
            <p className="font-game text-lg font-bold text-amber-900">✨ Golden! This root just got stronger</p>
          ) : (
            <div className="text-amber-950">
              <p className="font-game text-lg font-bold text-amber-700">🌿 Almost! This root needs a little more water</p>
              <p className="mt-3 text-sm">
                <span className="font-semibold">The trap changed: </span>
                <MutationHighlight text={textOf(state.picked)} compareTo={textOf(state.answer.correctTag)} tone="amber" />
              </p>
              <p className="mt-1.5 text-sm">
                <span className="font-semibold">The true statement: </span>
                <MutationHighlight text={textOf(state.answer.correctTag)} compareTo={textOf(state.picked)} tone="gold" />
              </p>
            </div>
          )}
          {state.progress && <MasteryMeter progress={state.progress} />}
          {state.progress && state.progress.coinsEarned > 0 && (
            <p className="mg-spring mt-3 inline-flex items-center gap-1.5 rounded-full border-[2.5px] border-[#b45309] bg-gradient-to-b from-[#fff7ae] to-[#fcd34d] px-3 py-1 font-game text-sm font-extrabold text-[#5a2a02] shadow-[0_3px_0_#8a4a0c]">
              +{state.progress.coinsEarned} 🪙 First mastery bonus
            </p>
          )}
        </GameSlab>
      )}
    </div>
  )
}

// Root mastery as a 5-notch capsule (one notch per correct answer): gold at Mighty Root.
function MasteryMeter({ progress }: { progress: DrillProgress }) {
  const { masteryLevel } = progress
  const up = leveledUp(progress)
  return (
    <div className="mt-4 flex items-center gap-3">
      <GameProgressBar
        value={masteryLevel}
        max={MAX_MASTERY}
        segments={MAX_MASTERY}
        tone={isMastered(masteryLevel) ? 'gold' : 'leaf'}
        label="Root mastery"
        className="flex-1"
      />
      <span className={up ? 'mg-spring font-game text-sm font-bold text-amber-900' : 'font-game text-sm font-bold text-amber-900/80'}>
        {MASTERY_NAMES[masteryLevel]} · {masteryLevel}/{MAX_MASTERY}
        {up && ' ⬆'}
      </span>
    </div>
  )
}

export { DrillCard }
