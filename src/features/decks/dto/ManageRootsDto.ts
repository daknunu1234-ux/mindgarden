import { z } from 'zod'
import { StatementTextDto } from './CreateKnowledgeItemsDto'

// Owner edits on the mindmap canvas (rename a root, delete an empty root, remove a statement).
export const UpdateMindmapNodeDto = z.object({
  nodeId: z.uuid('Invalid root'),
  title: z.string().trim().min(1, 'Name the root').max(150, 'Root name is too long'),
})

export const DeleteMindmapNodeDto = z.object({ nodeId: z.uuid('Invalid root') })

// deckId: the tree the statement is expected in (a statement of another tree is ITEM_NOT_FOUND).
export const DeleteKnowledgeItemDto = z.object({ deckId: z.uuid('Invalid tree'), itemId: z.uuid('Invalid statement') })

// Edit a statement's text (the owner's ✏️ Edit): same 5–500 plain-text rules as a bulk import.
export const UpdateKnowledgeItemDto = z.object({
  deckId: z.uuid('Invalid tree'),
  itemId: z.uuid('Invalid statement'),
  text: StatementTextDto,
})

// Move a statement (with its sub-statements) to another root or sub-root of the same tree. A
// sub-statement moved anywhere, its own root included, becomes a statement there.
export const MoveKnowledgeItemDto = z.object({
  deckId: z.uuid('Invalid tree'),
  itemId: z.uuid('Invalid statement'),
  toNodeId: z.uuid('Invalid root'),
})

// A whole root branch: the root, its sub-roots and every statement in them (and their progress).
export const DeleteRootBranchDto = z.object({ deckId: z.uuid('Invalid tree'), rootId: z.uuid('Invalid root') })

export type UpdateMindmapNodeInput = z.infer<typeof UpdateMindmapNodeDto>
export type DeleteMindmapNodeInput = z.infer<typeof DeleteMindmapNodeDto>
export type DeleteKnowledgeItemInput = z.infer<typeof DeleteKnowledgeItemDto>
export type UpdateKnowledgeItemInput = z.infer<typeof UpdateKnowledgeItemDto>
export type DeleteRootBranchInput = z.infer<typeof DeleteRootBranchDto>
export type MoveKnowledgeItemInput = z.infer<typeof MoveKnowledgeItemDto>
