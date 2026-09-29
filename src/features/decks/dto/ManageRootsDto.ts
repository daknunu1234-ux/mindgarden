import { z } from 'zod'

// Owner edits on the mindmap canvas (rename a root, delete an empty root, remove a statement).
export const UpdateMindmapNodeDto = z.object({
  nodeId: z.uuid('Invalid root'),
  title: z.string().trim().min(1, 'Name the root').max(150, 'Root name is too long'),
})

export const DeleteMindmapNodeDto = z.object({ nodeId: z.uuid('Invalid root') })

export const DeleteKnowledgeItemDto = z.object({ itemId: z.uuid('Invalid statement') })

export type UpdateMindmapNodeInput = z.infer<typeof UpdateMindmapNodeDto>
export type DeleteMindmapNodeInput = z.infer<typeof DeleteMindmapNodeDto>
export type DeleteKnowledgeItemInput = z.infer<typeof DeleteKnowledgeItemDto>
