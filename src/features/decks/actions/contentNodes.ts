'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { CreateContentNodeDto, IndentContentNodeDto, ToggleNodeTypeDto } from '../dto/ManageRootsDto'
import { createNode, indentNode, toggleNodeType as toggleType } from '../services/content'
import type { NodeType } from '../types'

// The Tree Workshop's outline edits on content nodes (public.content_nodes: roots and statements in
// one hierarchy). Auth: Required (the tree's owner). No revalidatePath: the page applies each change
// at once (deck draft, lib/contentTree.ts) and this confirms it. Errors: VALIDATION_FAILED,
// AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, NODE_NOT_FOUND, INTERNAL_ERROR.

async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

// A new root or statement under `parentId` (null = a top-level root), right after sibling `afterId`
// (else last). Enter on a line: a sibling of the same type, at the same level.
export async function createContentNode(input: unknown): Promise<ActionResult<{ id: string; drillable: boolean }>> {
  const parsed = CreateContentNodeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const { supabase, user } = await signedIn()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')
  const res = await createNode(supabase, user.id, parsed.data)
  return res.success ? ok({ id: res.data.id, drillable: res.data.drillable }) : res
}

// Alt: root ↔ statement, in place (a top-level root stays a root). Nothing is moved, deleted or
// re-inserted; progress on a statement is kept.
export async function toggleNodeType(input: unknown): Promise<ActionResult<{ id: string; type: NodeType; drillable: boolean }>> {
  const parsed = ToggleNodeTypeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const { supabase, user } = await signedIn()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')
  return toggleType(supabase, user.id, parsed.data)
}

// Tab ('in') / Shift+Tab ('out'), in place: the node becomes the last child of the sibling above, or
// goes up a level right below its old parent (the siblings below it becoming its children). Only the
// node and the direction are sent; the database finds the rest (indent_content_node).
export async function indentContentNode(input: unknown): Promise<ActionResult<{ id: string; parentId: string | null; movedChildren: number }>> {
  const parsed = IndentContentNodeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const { supabase, user } = await signedIn()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')
  return indentNode(supabase, user.id, parsed.data)
}
