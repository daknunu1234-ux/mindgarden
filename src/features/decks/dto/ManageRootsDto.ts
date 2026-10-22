import { z } from 'zod'
import { StatementTextDto } from './CreateKnowledgeItemsDto'

// Owner edits of a tree's outline (public.content_nodes: roots and statements in one hierarchy).

// Plain text only (hard rule 1) for statements: backslash commands like \frac are LaTeX.
const LATEX_COMMAND = /\\[a-zA-Z]+/
const NodeType = z.enum(['root', 'statement'], 'Type is root or statement')

// Rename a root.
export const UpdateMindmapNodeDto = z.object({
  nodeId: z.uuid('Invalid root'),
  title: z.string().trim().min(1, 'Name the root').max(150, 'Root name is too long'),
})

// Delete an empty root (no children at all).
export const DeleteMindmapNodeDto = z.object({ nodeId: z.uuid('Invalid root') })

// deckId: the tree the statement is expected in (a statement of another tree is ITEM_NOT_FOUND).
export const DeleteKnowledgeItemDto = z.object({ deckId: z.uuid('Invalid tree'), itemId: z.uuid('Invalid statement') })

// Edit a statement's text (the owner's ✏️ Edit): same 5–500 plain-text rules as a bulk import.
export const UpdateKnowledgeItemDto = z.object({
  deckId: z.uuid('Invalid tree'),
  itemId: z.uuid('Invalid statement'),
  text: StatementTextDto,
})

// A whole branch: the node and everything under it (and everyone's progress on its statements).
export const DeleteRootBranchDto = z.object({ deckId: z.uuid('Invalid tree'), rootId: z.uuid('Invalid root') })

// 📂 Move a node (with its branch) under another root of the same tree, as its last child.
export const MoveKnowledgeItemDto = z.object({
  deckId: z.uuid('Invalid tree'),
  itemId: z.uuid('Invalid statement'),
  toNodeId: z.uuid('Invalid root'),
})

// One new node of either type (the Tree Workshop's lines): under `parentId` (null = a top-level
// root), right after sibling `afterId`, else first among the siblings when `first` (an undone delete
// going back to its place), else last. Roots: 1–150 characters; statements: 1–500, plain
// text.
export const CreateContentNodeDto = z
  .object({
    deckId: z.uuid('Invalid tree'),
    parentId: z.uuid('Invalid parent').nullable(),
    type: NodeType,
    content: z.string().trim().min(1, 'Write something first').max(500, 'Keep it under 500 characters'),
    afterId: z.uuid('Invalid position').nullish(),
    first: z.boolean().optional(),
  })
  .refine((v) => v.type === 'statement' || [...v.content].length <= 150, { message: 'Root name is too long', path: ['content'] })
  .refine((v) => v.type === 'root' || !LATEX_COMMAND.test(v.content), { message: 'Use plain text, not LaTeX (no \\commands)', path: ['content'] })
  .refine((v) => v.parentId !== null || v.type === 'root', { message: 'A top-level node is a root', path: ['type'] })

// Alt: root ↔ statement, in place.
export const ToggleNodeTypeDto = z.object({ deckId: z.uuid('Invalid tree'), nodeId: z.uuid('Invalid node') })

// Tab ('in') / Shift+Tab ('out'), in place: only the node and the direction; the database finds the
// row above / the old parent itself.
export const IndentContentNodeDto = z.object({
  deckId: z.uuid('Invalid tree'),
  nodeId: z.uuid('Invalid node'),
  direction: z.enum(['in', 'out'], 'Direction is in or out'),
})

export type UpdateMindmapNodeInput = z.infer<typeof UpdateMindmapNodeDto>
export type DeleteMindmapNodeInput = z.infer<typeof DeleteMindmapNodeDto>
export type DeleteKnowledgeItemInput = z.infer<typeof DeleteKnowledgeItemDto>
export type UpdateKnowledgeItemInput = z.infer<typeof UpdateKnowledgeItemDto>
export type DeleteRootBranchInput = z.infer<typeof DeleteRootBranchDto>
export type MoveKnowledgeItemInput = z.infer<typeof MoveKnowledgeItemDto>
export type CreateContentNodeInput = z.infer<typeof CreateContentNodeDto>
export type ToggleNodeTypeInput = z.infer<typeof ToggleNodeTypeDto>
export type IndentContentNodeInput = z.infer<typeof IndentContentNodeDto>
