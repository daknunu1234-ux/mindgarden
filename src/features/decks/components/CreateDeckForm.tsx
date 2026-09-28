'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { createDeck } from '../actions/createDeck'
import type { TreeTypeId } from '@/shared/lib/treeSkins'
import { TreeSpeciesPicker } from './TreeSpeciesPicker'

function CreateDeckForm() {
  const router = useRouter()
  const { open: openLogin } = useLoginDialog()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [treeType, setTreeType] = useState<TreeTypeId>('oak')
  const [isPublic, setIsPublic] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createDeck({ title, description, treeType, isPublic })
      if (res.success) {
        router.push(`/deck/${res.data.slug}`)
        return
      }
      if (res.error.code === 'AUTH_UNAUTHORIZED') openLogin()
      setError(res.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="deck-title">Name</Label>
        <Input
          id="deck-title"
          required
          maxLength={150}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sinh học Tế bào"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="deck-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="deck-description"
          maxLength={1000}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will this tree help you remember?"
        />
      </div>

      <TreeSpeciesPicker value={treeType} onChange={setTreeType} />

      <div className="flex items-start gap-3">
        <Checkbox
          id="deck-public"
          checked={isPublic}
          onCheckedChange={(v) => setIsPublic(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-1">
          <Label htmlFor="deck-public">Public</Label>
          <p className="text-sm text-muted-foreground">Anyone can find and practice this tree.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Planting…' : 'Plant a Tree 🌱'}
      </Button>
    </form>
  )
}

export { CreateDeckForm }
