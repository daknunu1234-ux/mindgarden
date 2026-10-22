// Client-safe public API. Never re-export services/ from here.
export { cloneDeck } from './actions/cloneDeck'
export { createDeck } from './actions/createDeck'
export { createKnowledgeItem } from './actions/createKnowledgeItem'
export { createKnowledgeItems, type BulkImportResult } from './actions/createKnowledgeItems'
export { createMindmapNode } from './actions/createMindmapNode'
export { chopDeck, type ChoppedDeck } from './actions/chopDeck'
export { deleteKnowledgeItem } from './actions/deleteKnowledgeItem'
export { deleteRootBranch, type DeletedBranch } from './actions/deleteRootBranch'
export { updateKnowledgeItem, type EditedStatement } from './actions/updateKnowledgeItem'
export { deleteMindmapNode } from './actions/deleteMindmapNode'
export { moveKnowledgeItem, type MovedStatementResult } from './actions/moveKnowledgeItem'
export { getDeckBySlug } from './actions/getDeckBySlug'
export { getDeckEditor } from './actions/getDeckEditor'
export { getDeckReader } from './actions/getDeckReader'
export { getDecks } from './actions/getDecks'
export { importOutline } from './actions/importOutline'
export { getNeighborGarden } from './actions/getNeighborGarden'
export { getVisitedGardens } from './actions/getVisitedGardens'
export { recordTreeVisit } from './actions/recordTreeVisit'
export { setTournamentOpen } from './actions/setTournamentOpen'
export { updateDeck } from './actions/updateDeck'
export { renameDeck, type RenamedDeck } from './actions/renameDeck'
export { updateMindmapNode } from './actions/updateMindmapNode'
export { BulkStatementImporter } from './components/BulkStatementImporter'
export { CloneTreeButton } from './components/CloneTreeButton'
export { CreateDeckForm } from './components/CreateDeckForm'
export { DeckReader } from './components/DeckReader'
export { DeckEditor } from './components/LazyDeckEditor'
export { DeckDraftProvider, useDeckDraft, useDeckDraftActions, type DeckDraftActions } from './components/DeckDraft'
export { isPendingItemId } from './lib/draft'
export { DeckShareToggle } from './components/DeckShareToggle'
export { DeckDangerZone, DeleteDeckDialog } from './components/DeleteDeckDialog'
export { DeleteNodeDialog, DeleteRootDialog, DeleteStatementDialog, type NodeToDelete, type RootToDelete, type StatementToDelete } from './components/DeleteDialogs'
export { EditRootDialog, EditStatementDialog, type RootToEdit, type StatementToEdit } from './components/EditDialogs'
export { MoveStatementDialog, type StatementToMove } from './components/MoveStatementDialog'
export { OutlineStagingEditor } from './components/OutlineStagingEditor'
export { AddRootDialog, NodeManageDialog, type ManagedNode } from './components/NodeManageDialog'
export { TournamentHostToggle } from './components/TournamentHostToggle'
export { TreeSpeciesPicker } from './components/TreeSpeciesPicker'
export { TreeVisitTracker } from './components/TreeVisitTracker'
export { branchImpact, branchNodeIds, flatBranchImpact } from './lib/branch'
export {
  cleanStatement,
  parseBulletedText,
  previewBulkStatements,
  reviewBulkStatements,
  type BulkEdits,
  type BulkPreviewItem,
  type BulkReviewItem,
} from './lib/bulkStatements'
export { createContentNode, indentContentNode, toggleNodeType } from './actions/contentNodes'
export { branchCounts, indentRow, outlineRows, toDeckTree, toEditorNodes, toggleRow, type ContentSlot, type StoredNode } from './lib/contentTree'
export { countsAsVisit } from './lib/visits'
export { countDeckTree } from './lib/deckTree'
export type {
  ContentRow,
  Deck,
  DeckDetail,
  DeckEditor as DeckEditorData,
  DeckTreeItem,
  DeckTreeNode,
  EditorItem,
  EditorNode,
  NodeType,
  VisitedTree,
} from './types'
