import {
  EDITING_PLAYBOOK_V2_DOCUMENT_ID,
  EDITING_PLAYBOOK_V2_SOURCE_ID,
  buildEditingPlaybookResourceUri
} from "./editingPlaybook.js";
import { normalizeSearchText } from "./searchQuery.js";

export interface EditorTrainingSearchIntent {
  documentId: string;
  sourceId: string;
  canonicalTitle: string;
  resourceUri: string;
}

function buildEditorTrainingIntent(canonicalTitle: string): EditorTrainingSearchIntent {
  return {
    documentId: EDITING_PLAYBOOK_V2_DOCUMENT_ID,
    sourceId: EDITING_PLAYBOOK_V2_SOURCE_ID,
    canonicalTitle,
    resourceUri: buildEditingPlaybookResourceUri("v2")
  };
}

/**
 * Routes explicit editor-training topics to the editing playbook v2.
 *
 * The eight "メディアと編集研修" lessons were rebuilt from their slide decks into
 * 編集プレイブック v2 (editing-playbook-v2) on 2026-10-23: 編集会議 lives in its
 * chapter 11 and ウェブメディアの基礎 in chapter 02. The 2026-07-26 v1 page has neither
 * chapter, and the standalone lesson-01..07 / overview documents were removed from TiDB,
 * so these topics resolve to the whole v2 record.
 * The route stays intentionally narrow: it requires a distinctive lesson topic, while
 * generic queries continue through the ranked search path.
 */
export function resolveEditorTrainingSearchIntent(
  query: string
): EditorTrainingSearchIntent | null {
  const compactQuery = normalizeSearchText(query)
    .toLocaleLowerCase("ja")
    .replace(/[\s　_-]+/gu, "");

  if (compactQuery.includes("編集会議")) {
    return buildEditorTrainingIntent("編集プレイブック v2 11 編集会議・運営・PDCA");
  }

  const mentionsWebMedia =
    compactQuery.includes("ウェブメディア") ||
    compactQuery.includes("webメディア");
  const asksForFundamentals = ["基礎", "基本", "仕組み"].some((term) =>
    compactQuery.includes(term)
  );
  if (mentionsWebMedia && asksForFundamentals) {
    return buildEditorTrainingIntent("編集プレイブック v2 02 ウェブメディアの基礎");
  }

  return null;
}
