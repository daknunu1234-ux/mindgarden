'use client'

import { useState, type DragEvent, type ReactNode } from 'react'
import { GameButton, GameDialog, GameDialogContent } from '@/shared/components/game'
import { cn } from '@/shared/utils/cn'
import type { OutlineFormat, StagedOutlineItem } from '../lib/outlineParser/types'

export type OutlineImportLine = { level: StagedOutlineItem['level']; text: string }

// What the review step gets: the parsed outline, and the dialog's two ways out.
export type OutlineReview = {
  fileName: string
  format: OutlineFormat
  lines: OutlineImportLine[]
  // Back to picking a file (the staged edits are dropped).
  back: () => void
  // The import is done: close the dialog.
  close: () => void
}

type OutlineImportProps = {
  // The review step: the page renders decks' staging editor (the Tree Workshop's own outline editor,
  // edited in memory, imported on "Done"). The mindmap never calls actions itself.
  renderReview: (review: OutlineReview) => ReactNode
  className?: string
}

type Stage =
  | { name: 'pick'; error?: string }
  | { name: 'reading'; fileName: string }
  | { name: 'review'; fileName: string; format: OutlineFormat; lines: OutlineImportLine[]; notes: string[] }

const FORMAT_NAME: Record<OutlineFormat, string> = { docx: 'Word', pptx: 'PowerPoint', pdf: 'PDF' }

// "📄 Import from a document": a Word, PowerPoint or PDF file → a staged outline (roots, sub-roots,
// statements) the owner edits in the Tree Workshop's editor, then imports into this tree. The file is
// read in the browser's memory and never uploaded: only the confirmed outline is sent.
function OutlineImportButton({ renderReview, className }: OutlineImportProps) {
  const [open, setOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  return (
    <>
      <GameButton tone="cream" size="sm" className={className} onClick={() => setOpen(true)}>
        📄 Import from a document
      </GameButton>
      <GameDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setReviewing(false)
        }}
      >
        <GameDialogContent
          title="📄 Import an outline"
          ribbon="leaf"
          tone="parchment"
          size={reviewing ? 'xl' : 'lg'}
          description="Word (.docx), PowerPoint (.pptx) or PDF, up to 10 MB. The file stays on your device; only the outline you confirm is added to this tree."
          // While editing, Esc belongs to the outline's fields (it closes a line, as in the Workshop),
          // and a stray click outside must not throw the staged edits away: only ✕ closes.
          onEscapeKeyDown={(e) => {
            if (reviewing) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (reviewing) e.preventDefault()
          }}
        >
          {open && <OutlineImportBody renderReview={renderReview} onReviewing={setReviewing} onDone={() => (setOpen(false), setReviewing(false))} />}
        </GameDialogContent>
      </GameDialog>
    </>
  )
}

function OutlineImportBody({ renderReview, onReviewing, onDone }: OutlineImportProps & { onReviewing: (on: boolean) => void; onDone: () => void }) {
  const [stage, setStageRaw] = useState<Stage>({ name: 'pick' })
  const [dragging, setDragging] = useState(false)
  const setStage = (next: Stage) => {
    setStageRaw(next)
    onReviewing(next.name === 'review')
  }

  const read = async (file: File | undefined) => {
    if (!file) return
    setStage({ name: 'reading', fileName: file.name })
    try {
      // The parsers (and the zip / PDF libraries) load only now, not with the page.
      const { parseOutlineFile } = await import('../lib/outlineParser')
      const parsed = await parseOutlineFile(file)
      setStage({ name: 'review', fileName: file.name, format: parsed.format, lines: parsed.items.map(({ level, text }) => ({ level, text })), notes: parsed.notes })
    } catch (e) {
      setStage({ name: 'pick', error: e instanceof Error ? e.message : 'This file could not be read' })
    }
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    void read(event.dataTransfer.files?.[0])
  }

  if (stage.name === 'reading') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-center font-game text-base font-bold text-amber-900">
        <span aria-hidden className="inline-block size-3 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
        Reading “{stage.fileName}”…
      </p>
    )
  }

  if (stage.name === 'pick') {
    return (
      <div className="space-y-3">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[3px] border-dashed px-4 py-8 text-center font-game transition-colors focus-within:ring-4 focus-within:ring-yellow-300',
            dragging ? 'border-emerald-500 bg-emerald-50' : 'border-[#c9955e] bg-white/70 hover:bg-white',
          )}
        >
          <span aria-hidden className="text-4xl">
            📄
          </span>
          <span className="text-base font-extrabold text-[#4a2511]">Choose a file or drop it here</span>
          <span className="text-xs text-amber-900/70">Headings and numbering (I, A, 1, 1.1), slide titles and bullet levels become roots, sub-roots and statements.</span>
          <input
            type="file"
            accept=".docx,.pptx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
            className="sr-only"
            onChange={(e) => {
              void read(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {stage.error && (
          <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-center text-sm font-bold text-amber-900">
            {stage.error}.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-center font-game text-sm font-bold text-[#4a2511]">
        {FORMAT_NAME[stage.format]} · {stage.fileName}
      </p>
      {stage.notes.length > 0 && (
        <ul className="space-y-0.5 rounded-xl bg-amber-100/70 px-3 py-2 text-xs text-amber-900">
          {stage.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      {renderReview({ fileName: stage.fileName, format: stage.format, lines: stage.lines, back: () => setStage({ name: 'pick' }), close: onDone })}
    </div>
  )
}

export { OutlineImportButton }
