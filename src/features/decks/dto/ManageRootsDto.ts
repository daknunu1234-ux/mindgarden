import { z } from 'zod'

// Owner edits on the mindmap canvas (rename a root, delete an empty root, remove a statement).
export const UpdateMindmapNodeDto = z.object({
  nodeId: z.uuid('Invalid root'),
  title: z.string().trim().min(1, 'Name the root').max(150, 'Root name is too long'),
})

export const DeleteMindmapNodeDto = z.object({ nodeId: z.uuid('Invalid root') })

// deckId: the tree the statement is expected in (a statement of another tree is ITEM_NOT_FOUND).
export const DeleteKnowledgeItemDto = z.object({ deckId: z.uuid('Invalid tree'), itemId: z.uuid('Invalid statement') })

// A whole root branch: the root, its sub-roots and every statement in them (and their progress).
export const DeleteRootBranchDto = z.object({ deckId: z.uuid('Invalid tree'), rootId: z.uuid('Invalid root') })

export type UpdateMindmapNodeInput = z.infer<typeof UpdateMindmapNodeDto>
export type DeleteMindmapNodeInput = z.infer<typeof DeleteMindmapNodeDto>
export type DeleteKnowledgeItemInput = z.infer<typeof DeleteKnowledgeItemDto>
export type DeleteRootBranchInput = z.infer<typeof DeleteRootBranchDto>
